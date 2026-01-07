import { createHash, randomUUID } from "crypto";
import { nanoid } from "nanoid";
import pLimit from "p-limit";
import { storage } from "../storage";
import { getStorageBackend } from "./storageBackend";
import { sendSignatureRequestEmailWithUrl } from "./emailService";
import { authStorage } from "../replit_integrations/auth";

const CONCURRENCY_LIMIT = 5;

export async function processBulkBatch(batchId: string): Promise<void> {
  console.log(`[BulkProcessor] Starting batch ${batchId}`);
  
  const batch = await storage.getBulkBatch(batchId);
  if (!batch) {
    console.error(`[BulkProcessor] Batch ${batchId} not found`);
    return;
  }

  const pendingItems = await storage.getBulkItemsByStatus(batchId, "pending");
  console.log(`[BulkProcessor] Found ${pendingItems.length} pending items in batch ${batchId}`);

  if (pendingItems.length === 0) {
    // No pending items - recalculate final status based on existing items
    const allItems = await storage.getBulkItems(batchId);
    const sentCount = allItems.filter((i) => i.status === "sent").length;
    const errorCount = allItems.filter((i) => i.status === "error").length;
    
    let finalStatus: string;
    if (errorCount === allItems.length) {
      finalStatus = "failed";
    } else if (errorCount > 0) {
      finalStatus = "partial";
    } else {
      finalStatus = "completed";
    }
    
    await storage.updateBulkBatch(batchId, { status: finalStatus });
    console.log(`[BulkProcessor] Batch ${batchId} already processed with status: ${finalStatus} (${sentCount} sent, ${errorCount} errors)`);
    return;
  }

  const limit = pLimit(CONCURRENCY_LIMIT);

  const objectStorage = getStorageBackend();
  const pdfBuffer = await objectStorage.downloadBuffer(batch.pdfStorageKey);
  const originalHash = createHash("sha256").update(pdfBuffer).digest("hex");

  const baseUrl = process.env.BASE_URL || "https://fairsign.io";

  let senderVerified = false;
  let senderName: string | undefined;
  if (batch.userId) {
    const owner = await authStorage.getUser(batch.userId);
    senderVerified = !!owner?.identityVerifiedAt;
    senderName = owner ? `${owner.firstName || ''} ${owner.lastName || ''}`.trim() || owner.email : undefined;
  }

  const tasks = pendingItems.map((item) =>
    limit(async () => {
      try {
        console.log(`[BulkProcessor] Processing item ${item.id} for ${item.recipientEmail}`);

        const signingToken = nanoid(32);
        const signerToken = nanoid(32);
        const unsignedPdfKey = `documents/${nanoid()}/unsigned.pdf`;

        await objectStorage.uploadBuffer(pdfBuffer, unsignedPdfKey, "application/pdf");

        // Pre-generate signer ID using UUID to maintain compatibility with system expectations
        const signerId = randomUUID();

        // Parse field definitions from batch and link to pre-generated signer ID
        const batchFields = batch.fieldsJson as any[] | null;
        const documentFields = batchFields && Array.isArray(batchFields) 
          ? batchFields.map((field, index) => ({
              id: field.id || `field-${index}`,
              fieldType: field.fieldType || "signature",
              signerId: signerId, // Use pre-generated signer ID
              page: field.page || 1,
              x: field.x || 0,
              y: field.y || 0,
              width: field.width || 200,
              height: field.height || 50,
              required: field.required !== false,
              label: field.label || "",
              apiTag: field.apiTag || field.id,
            }))
          : [];

        // Create document with complete field/signer data in single insert
        const document = await storage.createDocument({
          userId: batch.userId,
          templateId: null,
          status: "sent",
          dataJson: {
            title: batch.title,
            oneOffDocument: true,
            recipientName: item.recipientName,
            recipientEmail: item.recipientEmail,
            bulkBatchId: batch.id,
            bulkItemId: item.id,
            fields: documentFields,
            signers: [{ id: signerId, email: item.recipientEmail, name: item.recipientName }],
          },
          callbackUrl: null,
          signingToken,
          unsignedPdfKey,
          signedPdfKey: null,
          signedPdfSha256: null,
          originalHash,
        });

        // Create signer with pre-generated ID
        await storage.createDocumentSigner({
          id: signerId,
          documentId: document.id,
          email: item.recipientEmail,
          name: item.recipientName,
          role: "signer",
          token: signerToken,
          status: "pending",
          orderIndex: 0,
        });

        await storage.createAuditEvent({
          documentId: document.id,
          event: "document_created",
          ip: null,
          userAgent: "BulkProcessor",
          metaJson: { bulkBatchId: batch.id, bulkItemId: item.id },
        });

        const signLink = `${baseUrl}/d/${document.id}?token=${signerToken}`;
        
        await sendSignatureRequestEmailWithUrl(
          document.id,
          item.recipientEmail,
          item.recipientName,
          signLink,
          batch.title,
          senderVerified,
          senderName
        );

        await storage.createAuditEvent({
          documentId: document.id,
          event: "email_sent",
          ip: null,
          userAgent: "BulkProcessor",
          metaJson: { recipientEmail: item.recipientEmail },
        });

        await storage.updateBulkItem(item.id, {
          status: "sent",
          envelopeId: document.id,
          errorMessage: null,
        });

        console.log(`[BulkProcessor] Successfully processed item ${item.id} - document ${document.id}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error(`[BulkProcessor] Error processing item ${item.id}:`, errorMessage);
        
        await storage.updateBulkItem(item.id, {
          status: "error",
          errorMessage,
        });
      }
    })
  );

  await Promise.all(tasks);

  // Determine final batch status based on item outcomes
  const allItems = await storage.getBulkItems(batchId);
  const sentCount = allItems.filter((i) => i.status === "sent").length;
  const errorCount = allItems.filter((i) => i.status === "error").length;
  const pendingCount = allItems.filter((i) => i.status === "pending").length;

  let finalStatus: string;
  if (pendingCount > 0) {
    // Some items still pending (shouldn't happen normally)
    finalStatus = "processing";
  } else if (errorCount === allItems.length) {
    // All failed
    finalStatus = "failed";
  } else if (errorCount > 0) {
    // Partial success
    finalStatus = "partial";
  } else {
    // All succeeded
    finalStatus = "completed";
  }

  await storage.updateBulkBatch(batchId, { status: finalStatus });
  console.log(`[BulkProcessor] Batch ${batchId} finished with status: ${finalStatus} (${sentCount} sent, ${errorCount} errors, ${pendingCount} pending)`);
}
