import type { Express, Request, Response, NextFunction } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { getStorageBackend, type IStorageBackend } from "./services/storageBackend";
import { createDocumentRequestSchema } from "@shared/schema";
import { renderHtmlToPdf, renderDocumentFromTemplate } from "./services/pdfRender";
import { stampSignaturesIntoPdf, appendAuditTrailPage } from "./services/pdfStamp";
import { sendWebhook } from "./services/webhook";
import { logAuditEvent } from "./services/audit";
import { 
  sendSignatureRequestEmail, 
  sendCompletionNoticeEmail, 
  sendCompletionEmailWithAttachment,
  sendReminderEmail,
  getEmailLogsForDocument 
} from "./services/emailService";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { authStorage } from "./replit_integrations/auth/storage";
import { nanoid } from "nanoid";
import { createHash } from "crypto";
import multer from "multer";
import { z } from "zod";

const upload = multer({ storage: multer.memoryStorage() });

// Helper to join paths without double slashes
function joinStoragePath(prefix: string, key: string): string {
  if (!prefix || prefix === "/" || prefix === "") {
    return key;
  }
  const cleanPrefix = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  const cleanKey = key.startsWith("/") ? key.slice(1) : key;
  return `${cleanPrefix}/${cleanKey}`;
}

// Configurable storage backend (Replit Object Storage or S3/R2)
let objectStorage: IStorageBackend;

// Helper function to check if a user can access documents from another user (team membership)
async function canAccessUserDocuments(currentUserId: string, documentOwnerId: string | null): Promise<boolean> {
  if (!documentOwnerId) return false;
  if (currentUserId === documentOwnerId) return true;
  
  // Check if both users are in the same organization
  const currentUser = await authStorage.getUser(currentUserId);
  const documentOwner = await authStorage.getUser(documentOwnerId);
  
  if (!currentUser?.organizationId || !documentOwner?.organizationId) {
    return false;
  }
  
  // Users are in the same organization
  return currentUser.organizationId === documentOwner.organizationId;
}

// Get all user IDs that the current user can access documents from (self + team members)
async function getAccessibleUserIds(userId: string): Promise<string[]> {
  const userIds = [userId];
  
  const user = await authStorage.getUser(userId);
  if (!user?.organizationId) {
    return userIds;
  }
  
  // Get all members in the same organization
  const members = await authStorage.getOrganizationMembers(user.organizationId);
  for (const member of members) {
    if (member.userId !== userId) {
      userIds.push(member.userId);
    }
  }
  
  return userIds;
}

// Helper to check if a user can access a template (owner, default, or team member)
async function canAccessTemplate(userId: string, templateOwnerId: string | null, isDefault: boolean): Promise<boolean> {
  if (isDefault) return true;
  if (!templateOwnerId) return false;
  return canAccessUserDocuments(userId, templateOwnerId);
}

// BoldSign compatibility mode
const BOLDSIGN_COMPAT = process.env.WEBHOOK_COMPAT_MODE === "boldsign";
if (BOLDSIGN_COMPAT) {
  console.log("[BoldSign Compat] Compatibility mode enabled");
}

// Internal API key middleware for server-to-server calls
function validateInternalApiKey(req: Request, res: Response, next: NextFunction) {
  const internalApiKey = process.env.INTERNAL_API_KEY;
  if (!internalApiKey) {
    console.warn("[Security] INTERNAL_API_KEY not set - internal endpoints disabled");
    return res.status(503).json({ error: "Internal API not configured" });
  }

  const providedKey = req.headers["x-internal-api-key"] as string;
  if (!providedKey || providedKey !== internalApiKey) {
    return res.status(401).json({ error: "Invalid or missing internal API key" });
  }

  next();
}

// Middleware to validate signing token (supports both document-level and signer-level tokens)
async function validateToken(req: Request, res: Response, next: NextFunction) {
  const token = req.query.token as string;
  const documentId = req.params.id;

  if (!token) {
    return res.status(401).json({ error: "Token required" });
  }

  const document = await storage.getDocument(documentId);
  if (!document) {
    return res.status(404).json({ error: "Document not found" });
  }

  // Check document-level token first (single-signer or legacy)
  if (document.signingToken === token) {
    (req as any).document = document;
    (req as any).signer = null; // No specific signer
    return next();
  }

  // Check signer-specific token (multi-signer)
  const signers = await storage.getDocumentSigners(documentId);
  const signer = signers.find(s => s.token === token);
  
  if (signer) {
    (req as any).document = document;
    (req as any).signer = signer;
    return next();
  }

  return res.status(401).json({ error: "Invalid token" });
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Initialize storage backend
  objectStorage = getStorageBackend();

  // CSP frame-ancestors middleware for iframe embedding
  const allowedFrameAncestors = process.env.ALLOWED_FRAME_ANCESTORS;
  if (allowedFrameAncestors) {
    const ancestors = allowedFrameAncestors.split(",").map(s => s.trim()).filter(Boolean);
    console.log(`[BoldSign Compat] Frame embedding allowed from: ${ancestors.join(", ")}`);
    
    app.use((req, res, next) => {
      // Only apply to signing pages and API routes
      if (req.path.startsWith("/d/") || req.path.startsWith("/sign/") || req.path.startsWith("/api/")) {
        res.setHeader(
          "Content-Security-Policy",
          `frame-ancestors 'self' ${ancestors.join(" ")}`
        );
        res.setHeader("X-Frame-Options", "ALLOW-FROM " + ancestors[0]);
      }
      next();
    });
  }

  // Setup authentication (must be before other routes)
  await setupAuth(app);
  registerAuthRoutes(app);

  // Seed default templates and signature spots
  await seedDefaultTemplates();
  await seedSignatureSpots();

  // Health check endpoint
  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
  });

  // Create a new document
  app.post("/api/documents", async (req: Request, res: Response) => {
    try {
      const parseResult = createDocumentRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          error: "Invalid request",
          details: parseResult.error.errors,
        });
      }

      const { template_id, data, callback_url, signers } = parseResult.data;

      // Generate document-level signing token (for single-signer backward compatibility)
      const signingToken = nanoid(32);

      // Render document from template (supports both HTML and PDF templates)
      console.log(`Rendering document from template: ${template_id}`);
      const pdfBuffer = await renderDocumentFromTemplate(template_id, data);

      // Upload unsigned PDF to object storage
      const unsignedPdfKey = `documents/${nanoid()}/unsigned.pdf`;
      await objectStorage.uploadBuffer(pdfBuffer, unsignedPdfKey, "application/pdf");
      console.log(`Uploaded unsigned PDF: ${unsignedPdfKey}`);

      // Create document record
      const document = await storage.createDocument({
        templateId: template_id,
        status: "created",
        dataJson: data,
        callbackUrl: callback_url || null,
        signingToken,
        unsignedPdfKey,
        signedPdfKey: null,
        signedPdfSha256: null,
      });

      // Log audit event
      await logAuditEvent(document.id, "document_created", req, { template_id });

      const baseUrl = process.env.BASE_URL || `https://${req.headers.host}`;

      // Handle multi-signer case
      if (signers && signers.length > 0) {
        const signerLinks: Array<{ email: string; name: string; role: string; signLink: string }> = [];
        
        for (const signer of signers) {
          const signerToken = nanoid(32);
          await storage.createDocumentSigner({
            documentId: document.id,
            email: signer.email,
            name: signer.name,
            role: signer.role,
            token: signerToken,
            status: "pending",
          });

          const signLink = `${baseUrl}/d/${document.id}?token=${signerToken}`;
          signerLinks.push({
            email: signer.email,
            name: signer.name,
            role: signer.role,
            signLink,
          });

          await logAuditEvent(document.id, "signer_added", req, { 
            signerEmail: signer.email, 
            signerRole: signer.role 
          });
        }

        console.log(`Document created: ${document.id} with ${signers.length} signers`);

        res.status(201).json({
          document_id: document.id,
          documentId: document.id,
          signers: signerLinks,
          status: "created",
        });
      } else {
        // Single-signer backward compatibility
        const signingUrl = `${baseUrl}/d/${document.id}?token=${signingToken}`;

        console.log(`Document created: ${document.id}`);
        console.log(`Signing URL: ${signingUrl}`);

        res.status(201).json({
          // Original fields
          document_id: document.id,
          signing_url: signingUrl,
          // BoldSign-compatible aliases
          documentId: document.id,
          signLink: signingUrl,
        });
      }
    } catch (error) {
      console.error("Error creating document:", error);
      res.status(500).json({ error: "Failed to create document" });
    }
  });

  // Get document metadata for signing
  app.get("/api/documents/:id", validateToken, async (req: Request, res: Response) => {
    try {
      const document = (req as any).document;
      const signer = (req as any).signer;

      // Get document title from dataJson for one-off documents
      const dataJson = document.dataJson as Record<string, any> | null;
      const isOneOff = dataJson?.oneOffDocument === true;
      const documentTitle = dataJson?.title || "Document";

      // Get signature spots - handle one-off documents differently
      let spots: Array<{
        id: string;
        spotKey: string;
        kind: string;
        page: number;
        x: number;
        y: number;
        w: number;
        h: number;
        role?: string;
      }>;

      // Track which spots belong to this signer (for signing, not display)
      let requiredSpotKeys: string[] = [];

      if (isOneOff && dataJson?.fields) {
        // One-off document: convert ALL fields from dataJson to spots format
        const allFields = dataJson.fields as Array<{
          id: string;
          fieldType: string;
          signerId: string;
          page: number;
          x: number;
          y: number;
          width: number;
          height: number;
          creatorFills?: boolean;
        }>;

        // Include ALL spots for rendering (including creatorFills for visual context)
        // Preserve fieldType as kind to support text, date, checkbox fields
        spots = allFields.map(field => ({
          id: field.id,
          spotKey: field.id,
          kind: field.fieldType, // text | signature | initial | date | checkbox
          page: field.page,
          x: field.x,
          y: field.y,
          w: field.width,
          h: field.height,
          role: field.signerId,
          creatorFills: field.creatorFills || false, // Pass through for UI rendering
        }));

        // Track only non-creatorFills spots this signer needs to complete
        const signerFields = allFields.filter(f => !f.creatorFills);
        if (signer) {
          requiredSpotKeys = signerFields
            .filter(f => f.signerId === signer.role)
            .map(f => f.id);
        } else {
          requiredSpotKeys = signerFields.map(f => f.id);
        }
      } else if (signer) {
        // Template-based multi-signer: get all spots but track which are for this signer
        spots = await storage.getSignatureSpots(document.templateId);
        const signerSpots = await storage.getSignatureSpotsByRole(document.templateId, signer.role);
        requiredSpotKeys = signerSpots.map(s => s.spotKey);
      } else {
        // Template-based single-signer: show all spots
        spots = await storage.getSignatureSpots(document.templateId);
        requiredSpotKeys = spots.map(s => s.spotKey);
      }

      // Get uploaded signature assets (all for the document)
      const assets = await storage.getSignatureAssets(document.id);
      const signingToken = req.query.token as string;
      
      // For the counter, only include spots signed by THIS signer (by signerRole)
      const uploadedSpots = signer
        ? assets.filter(a => a.signerRole === signer.role).map(a => a.spotKey)
        : assets.map(a => a.spotKey);
      
      // Build signature image URLs for ALL uploaded signatures (to show previous signers' signatures)
      // All signatures are visible to current signer - this allows seeing prior completed signatures
      // Use Object.create(null) to prevent prototype pollution when using dynamic keys
      const signatureImages: Record<string, string> = Object.create(null);
      for (const asset of assets) {
        signatureImages[asset.spotKey] = `/api/documents/${document.id}/signature-image/${asset.spotKey}?token=${signingToken}`;
      }

      // Use proxy URL instead of presigned URL to avoid CORS issues
      const unsignedPdfUrl = `/api/documents/${document.id}/unsigned.pdf?token=${signingToken}`;

      // Log view event
      await logAuditEvent(document.id, "document_viewed", req, {
        signerEmail: signer?.email,
        signerRole: signer?.role,
      });

      // Get all signers for status display (multi-signer mode)
      const allSigners = signer ? await storage.getDocumentSigners(document.id) : [];

      // Get text field values for one-off documents
      // Use Object.create(null) to prevent prototype pollution when using dynamic keys
      let textValues: Record<string, string> = Object.create(null);
      if (isOneOff) {
        const textFieldValuesList = await storage.getTextFieldValues(document.id);
        for (const tfv of textFieldValuesList) {
          textValues[tfv.spotKey] = tfv.value;
          // Also mark text field spots as uploaded
          if (!uploadedSpots.includes(tfv.spotKey)) {
            uploadedSpots.push(tfv.spotKey);
          }
        }
      }

      res.json({
        id: document.id,
        templateId: document.templateId,
        status: document.status,
        title: documentTitle,
        unsignedPdfUrl,
        spots, // All spots for rendering (includes all signers)
        requiredSpotKeys, // Spot keys this signer needs to sign
        uploadedSpots, // Spots already signed/filled by this signer (for counter)
        signatureImages, // Map of spotKey -> image URL for rendering on PDF
        textValues, // Map of spotKey -> text value for text/date/checkbox fields
        signerId: signer?.id || null, // The ID of the current signer (for mobile signing sessions)
        currentSigner: signer ? {
          email: signer.email,
          name: signer.name,
          role: signer.role,
          status: signer.status,
        } : null,
        signers: allSigners.map(s => ({
          email: s.email,
          name: s.name,
          role: s.role,
          status: s.status,
        })),
      });
    } catch (error) {
      console.error("Error getting document:", error);
      res.status(500).json({ error: "Failed to get document" });
    }
  });

  // Upload a signature or initial
  app.post(
    "/api/documents/:id/signatures",
    validateToken,
    upload.single("image"),
    async (req: Request, res: Response) => {
      try {
        const document = (req as any).document;
        const signer = (req as any).signer;
        const spotKey = req.body.spot_key;
        const file = req.file;

        if (!spotKey) {
          return res.status(400).json({ error: "spot_key required" });
        }

        if (!file) {
          return res.status(400).json({ error: "image file required" });
        }

        if (document.status === "completed") {
          return res.status(400).json({ error: "Document already completed" });
        }

        // Verify spot exists - check dataJson for one-off documents, otherwise signature_spots table
        let spotRole: string | null = null;
        const docData = document.dataJson as Record<string, any> | null;
        
        if (docData?.oneOffDocument && docData.fields) {
          // One-off document: look up spot in dataJson.fields
          const field = (docData.fields as Array<{ id: string; signerId: string }>)
            .find(f => f.id === spotKey);
          if (!field) {
            return res.status(400).json({ error: "Invalid spot_key" });
          }
          spotRole = field.signerId;
        } else {
          // Template-based document: look up spot in signature_spots table
          const spot = await storage.getSignatureSpot(document.templateId, spotKey);
          if (!spot) {
            return res.status(400).json({ error: "Invalid spot_key" });
          }
          spotRole = spot.signerRole;
        }

        // Multi-signer: verify this signer is allowed to sign this spot
        if (signer && spotRole !== signer.role) {
          return res.status(403).json({ 
            error: "This signature spot is not assigned to you",
            yourRole: signer.role,
            spotRole: spotRole,
          });
        }

        // Check if already uploaded
        const existing = await storage.getSignatureAsset(document.id, spotKey);
        if (existing) {
          return res.status(400).json({ error: "Signature already uploaded for this spot" });
        }

        // Upload signature image to object storage
        const imageKey = `documents/${document.id}/signatures/${spotKey}.png`;
        await objectStorage.uploadBuffer(file.buffer, imageKey, "image/png");

        // Create signature asset record (with signer info if multi-signer)
        await storage.createSignatureAsset({
          documentId: document.id,
          spotKey,
          imageKey,
          signerRole: signer?.role || null,
          signerEmail: signer?.email || null,
        });

        // Log audit event
        await logAuditEvent(document.id, "signature_uploaded", req, { 
          spotKey,
          signerEmail: signer?.email,
          signerRole: signer?.role,
        });

        console.log(`Signature uploaded: ${spotKey} for document ${document.id}${signer ? ` by ${signer.email}` : ""}`);

        res.status(201).json({ success: true, spotKey });
      } catch (error) {
        console.error("Error uploading signature:", error);
        res.status(500).json({ error: "Failed to upload signature" });
      }
    }
  );

  // Submit a text field value (for text, date, checkbox fields)
  app.post(
    "/api/documents/:id/text-field",
    validateToken,
    async (req: Request, res: Response) => {
      try {
        const document = (req as any).document;
        const signer = (req as any).signer;
        const { spotKey, value } = req.body;

        if (!spotKey || value === undefined) {
          return res.status(400).json({ error: "spotKey and value are required" });
        }

        if (document.status === "completed") {
          return res.status(400).json({ error: "Document already completed" });
        }

        // Verify spot exists and is a text/date/checkbox field
        const docData = document.dataJson as Record<string, any> | null;
        
        if (!docData?.oneOffDocument || !docData.fields) {
          return res.status(400).json({ error: "Text fields are only supported for one-off documents" });
        }

        const field = (docData.fields as Array<{ id: string; signerId: string; fieldType: string }>)
          .find(f => f.id === spotKey);
        
        if (!field) {
          return res.status(400).json({ error: "Invalid spotKey" });
        }

        if (!["text", "date", "checkbox"].includes(field.fieldType)) {
          return res.status(400).json({ error: "This spot is not a text field" });
        }

        // Multi-signer: verify this signer is allowed to fill this field
        if (signer && field.signerId !== signer.role) {
          return res.status(403).json({ 
            error: "This field is not assigned to you",
            yourRole: signer.role,
            fieldRole: field.signerId,
          });
        }

        // Check if already filled
        const existingValues = await storage.getTextFieldValues(document.id);
        const existing = existingValues.find(v => v.spotKey === spotKey);
        if (existing) {
          return res.status(400).json({ error: "Value already submitted for this field" });
        }

        // Create text field value record
        await storage.createTextFieldValue({
          documentId: document.id,
          spotKey,
          value,
          fieldType: field.fieldType,
          signerRole: signer?.role || null,
          signerEmail: signer?.email || null,
        });

        // Log audit event
        await logAuditEvent(document.id, "text_field_submitted", req, { 
          spotKey,
          fieldType: field.fieldType,
          signerEmail: signer?.email,
          signerRole: signer?.role,
        });

        console.log(`Text field submitted: ${spotKey} for document ${document.id}${signer ? ` by ${signer.email}` : ""}`);

        res.status(201).json({ success: true, spotKey });
      } catch (error) {
        console.error("Error submitting text field:", error);
        res.status(500).json({ error: "Failed to submit text field" });
      }
    }
  );

  // Complete document signing (supports both single-signer and multi-signer modes)
  app.post("/api/documents/:id/complete", validateToken, async (req: Request, res: Response) => {
    try {
      const document = (req as any).document;
      const signer = (req as any).signer;

      if (document.status === "completed") {
        return res.status(400).json({ error: "Document already completed" });
      }

      // Check consent
      if (!req.body.consent) {
        return res.status(400).json({ error: "Consent required" });
      }

      // Multi-signer: check if this signer already completed
      if (signer && signer.status === "completed") {
        return res.status(400).json({ error: "You have already signed this document" });
      }

      // Get spots for verification (role-specific for multi-signer)
      let spotsToVerify: Array<{ spotKey: string }>;
      const docData = document.dataJson as Record<string, any> | null;
      
      if (docData?.oneOffDocument && docData.fields) {
        // One-off document: get spots from dataJson.fields
        const allFields = docData.fields as Array<{ id: string; signerId: string }>;
        const relevantFields = signer 
          ? allFields.filter(f => f.signerId === signer.role)
          : allFields;
        spotsToVerify = relevantFields.map(f => ({ spotKey: f.id }));
      } else if (signer) {
        spotsToVerify = await storage.getSignatureSpotsByRole(document.templateId, signer.role);
      } else {
        spotsToVerify = await storage.getSignatureSpots(document.templateId);
      }

      // Get uploaded signatures
      const assets = await storage.getSignatureAssets(document.id);
      const uploadedSpotKeys = new Set(assets.map((a) => a.spotKey));

      // Also get text field values (for text, date, checkbox fields)
      const completedTextFields = await storage.getTextFieldValues(document.id);
      for (const tfv of completedTextFields) {
        uploadedSpotKeys.add(tfv.spotKey);
      }

      // Verify required spots for this signer are signed/filled
      const missingSpots = spotsToVerify.filter((s) => !uploadedSpotKeys.has(s.spotKey));
      if (missingSpots.length > 0) {
        return res.status(400).json({
          error: "Missing signatures",
          missing: missingSpots.map((s) => s.spotKey),
        });
      }

      // Log consent
      await logAuditEvent(document.id, "consent_given", req, {
        signerEmail: signer?.email,
        signerRole: signer?.role,
      });

      // Multi-signer: mark this signer as completed and check if all done
      if (signer) {
        await storage.updateDocumentSigner(signer.id, {
          status: "completed",
          signedAt: new Date(),
        });

        await logAuditEvent(document.id, "signer_completed", req, {
          signerEmail: signer.email,
          signerRole: signer.role,
        });

        console.log(`Signer ${signer.email} (${signer.role}) completed for document ${document.id}`);

        // Send "Signed" webhook for this signer (BoldSign compat)
        if (document.callbackUrl && BOLDSIGN_COMPAT) {
          const signedWebhook = {
            event: "Signed",
            documentId: document.id,
            signerEmail: signer.email,
            signerName: signer.name,
            signerRole: signer.role,
          };
          await sendWebhook(document.callbackUrl, signedWebhook);
          await logAuditEvent(document.id, "signer_webhook_sent", req, {
            signerEmail: signer.email,
            event: "Signed",
          });
        }

        // Check if all signers completed (signers are ordered by orderIndex)
        const allSigners = await storage.getDocumentSigners(document.id);
        const allCompleted = allSigners.every(s => s.status === "completed");

        if (!allCompleted) {
          // Find the next pending signer in order and notify them
          const pendingSigners = allSigners.filter(s => s.status !== "completed");
          const nextSigner = pendingSigners[0]; // First pending signer (lowest orderIndex)
          const docData = document.dataJson as Record<string, any> | null;
          
          // Only send email to next signer if this is a one-off document (sequential signing)
          // and the signer has valid email and token
          if (nextSigner && docData?.oneOffDocument && nextSigner.email && nextSigner.token) {
            // Send email to next signer in sequence
            try {
              const baseUrl = process.env.BASE_URL || `https://${req.headers.host}`;
              const signLink = `${baseUrl}/d/${document.id}?token=${nextSigner.token}`;
              const documentTitle = docData?.title || docData?.tenant_name || "Document";
              
              const { sendSignatureRequestEmailWithUrl } = await import("./services/emailService");
              await sendSignatureRequestEmailWithUrl(
                document.id,
                nextSigner.email,
                nextSigner.name,
                signLink,
                documentTitle
              );
              
              console.log(`[Sequential] Email sent to next signer: ${nextSigner.email} (order: ${nextSigner.orderIndex ?? 'N/A'})`);
              
              await logAuditEvent(document.id, "next_signer_notified", req, {
                signerEmail: nextSigner.email,
                signerName: nextSigner.name,
                signerRole: nextSigner.role,
                orderIndex: nextSigner.orderIndex ?? 0,
              });
            } catch (emailError) {
              console.error(`[Sequential] Failed to send email to next signer ${nextSigner.email}:`, emailError);
            }
          }
          
          // Not all signers done - return partial completion response
          return res.json({
            success: true,
            document_id: document.id,
            status: "partial",
            message: "Your signature has been recorded. Waiting for other signers.",
            pendingSigners: pendingSigners.map(s => s.email),
          });
        }

        console.log(`All signers completed for document ${document.id} - finalizing PDF`);
      }

      // All signers completed (or single-signer) - stamp and finalize PDF
      const dataJson = document.dataJson as Record<string, any> | null;
      const isOneOff = dataJson?.oneOffDocument === true;

      // Get spots - handle one-off documents differently
      let allSpots: Array<{
        id: string;
        spotKey: string;
        page: number;
        x: number;
        y: number;
        w: number;
        h: number;
        kind: string;
      }>;

      if (isOneOff && dataJson?.fields) {
        // One-off document: use fields from dataJson, preserving fieldType
        allSpots = (dataJson.fields as Array<{
          id: string;
          fieldType: string;
          page: number;
          x: number;
          y: number;
          width: number;
          height: number;
        }>).map(field => ({
          id: field.id,
          spotKey: field.id,
          page: field.page,
          x: field.x,
          y: field.y,
          w: field.width,
          h: field.height,
          kind: field.fieldType, // Preserve full fieldType for text/date/checkbox
        }));
      } else {
        // Template-based: get from signature_spots table
        allSpots = await storage.getSignatureSpots(document.templateId);
      }

      const allAssets = await storage.getSignatureAssets(document.id);
      
      // Get text field values for one-off documents
      let textFieldValues: Array<{ spotKey: string; value: string; fieldType: string }> = [];
      if (isOneOff) {
        textFieldValues = await storage.getTextFieldValues(document.id);
        console.log(`Found ${textFieldValues.length} text field values to stamp`);
      }

      // Download unsigned PDF
      const privateDir = objectStorage.getPrivateObjectDir();
      const unsignedPath = joinStoragePath(privateDir, document.unsignedPdfKey);
      const unsignedPdfBuffer = await objectStorage.downloadBuffer(unsignedPath);

      // Download all signature images with signed dates
      const signatures = await Promise.all(
        allAssets.map(async (asset) => {
          const imagePath = joinStoragePath(privateDir, asset.imageKey);
          const imageBuffer = await objectStorage.downloadBuffer(imagePath);
          return {
            spotKey: asset.spotKey,
            imageBuffer,
            signedAt: asset.createdAt,
          };
        })
      );

      // Stamp signatures and text fields into PDF
      console.log("Stamping signatures and text fields into PDF...");
      const stampedPdfBuffer = await stampSignaturesIntoPdf(
        unsignedPdfBuffer,
        allSpots,
        signatures,
        textFieldValues
      );

      // Calculate SHA-256 hash of stamped PDF (before audit trail)
      const sha256 = createHash("sha256").update(stampedPdfBuffer).digest("hex");

      // Get audit events and append audit trail page
      const auditEvents = await storage.getAuditEvents(document.id);
      const signedPdfBuffer = await appendAuditTrailPage(stampedPdfBuffer, auditEvents, {
        documentId: document.id,
        documentTitle: docData?.title || docData?.tenant_name || undefined,
        sha256,
      });

      // Upload signed PDF
      const signedPdfKey = `documents/${document.id}/signed.pdf`;
      await objectStorage.uploadBuffer(signedPdfBuffer, signedPdfKey, "application/pdf");

      // Update document
      await storage.updateDocument(document.id, {
        status: "completed",
        signedPdfKey,
        signedPdfSha256: sha256,
      });

      // Log completion
      await logAuditEvent(document.id, "completed", req, { sha256 });

      console.log(`Document completed: ${document.id}`);
      console.log(`Signed PDF SHA-256: ${sha256}`);

      // Send final "Completed" webhook
      if (document.callbackUrl) {
        const signedPdfUrl = await objectStorage.getSignedDownloadUrl(
          signedPdfKey,
          86400 // 24 hours
        );

        // BoldSign-compatible webhook payload
        const webhookPayload = BOLDSIGN_COMPAT ? {
          event: "Completed",
          documentId: document.id,
          status: "completed",
          signed_pdf_url: signedPdfUrl,
          signed_pdf_sha256: sha256,
          template_id: document.templateId,
          data: document.dataJson,
        } : {
          event: "document.completed",
          document_id: document.id,
          status: "completed",
          signed_pdf_key: signedPdfKey,
          signed_pdf_url: signedPdfUrl,
          signed_pdf_sha256: sha256,
        };

        await sendWebhook(document.callbackUrl, webhookPayload);
        await logAuditEvent(document.id, "webhook_sent", req, { 
          callback_url: document.callbackUrl,
          compat_mode: BOLDSIGN_COMPAT ? "boldsign" : "default"
        });
      }

      // Send completion email with signed PDF attachment to all signers
      const documentTitle = docData?.title || docData?.tenant_name || "Document";
      try {
        // Get all signers from document_signers table
        const documentSigners = await storage.getDocumentSigners(document.id);
        
        if (documentSigners.length > 0) {
          // Send to all signers from document_signers table
          for (const signer of documentSigners) {
            try {
              await sendCompletionEmailWithAttachment(
                document.id,
                signer.email,
                signer.name,
                documentTitle,
                signedPdfBuffer
              );
              await logAuditEvent(document.id, "completion_email_sent", req, { 
                recipientEmail: signer.email,
                hasAttachment: true 
              });
              console.log(`[EMAIL] Sent completion email with attachment to ${signer.email}`);
            } catch (signerEmailError) {
              console.error(`Failed to send completion email to ${signer.email}:`, signerEmailError);
            }
          }
        } else if (docData?.tenantEmail && typeof docData.tenantEmail === 'string' && docData.tenantEmail.includes('@')) {
          // Fallback for template-based documents without document_signers records
          await sendCompletionEmailWithAttachment(
            document.id,
            docData.tenantEmail,
            docData.tenant_name || "Tenant",
            documentTitle,
            signedPdfBuffer
          );
          await logAuditEvent(document.id, "completion_email_sent", req, { 
            recipientEmail: docData.tenantEmail,
            hasAttachment: true 
          });
          console.log(`[EMAIL] Sent completion email with attachment to ${docData.tenantEmail}`);
        } else {
          console.log(`[EMAIL] No signers found and no valid tenant email for document ${document.id}`);
        }
      } catch (completionEmailError) {
        console.error("Failed to send completion emails:", completionEmailError);
      }

      // Send completion notification to document owner (if exists)
      if (document.userId) {
        const ownerEmail = docData?.ownerEmail || docData?.landlordEmail;
        if (ownerEmail) {
          try {
            await sendCompletionNoticeEmail(document, ownerEmail, docData?.ownerName || docData?.landlordName, true);
            await logAuditEvent(document.id, "completion_email_sent", req, { recipientEmail: ownerEmail });
          } catch (emailError) {
            console.error("Failed to send completion email:", emailError);
          }
        }
      }

      res.json({
        success: true,
        document_id: document.id,
        status: "completed",
        sha256,
      });
    } catch (error) {
      console.error("Error completing document:", error);
      res.status(500).json({ error: "Failed to complete document" });
    }
  });

  // Proxy endpoint for unsigned PDF (avoids CORS issues with presigned URLs)
  app.get("/api/documents/:id/unsigned.pdf", validateToken, async (req: Request, res: Response) => {
    try {
      const document = (req as any).document;

      if (!document.unsignedPdfKey) {
        return res.status(404).json({ error: "Unsigned PDF not available" });
      }

      const privateDir = objectStorage.getPrivateObjectDir();
      const unsignedPath = joinStoragePath(privateDir, document.unsignedPdfKey);
      const pdfBuffer = await objectStorage.downloadBuffer(unsignedPath);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error proxying unsigned PDF:", error);
      res.status(500).json({ error: "Failed to load PDF" });
    }
  });

  // Proxy endpoint for signature images (for rendering on PDF preview)
  app.get("/api/documents/:id/signature-image/:spotKey", validateToken, async (req: Request, res: Response) => {
    try {
      const document = (req as any).document;
      const { spotKey } = req.params;

      // Get the signature asset for this spot
      const assets = await storage.getSignatureAssets(document.id);
      const asset = assets.find(a => a.spotKey === spotKey);

      if (!asset || !asset.imageKey) {
        return res.status(404).json({ error: "Signature not found" });
      }

      const privateDir = objectStorage.getPrivateObjectDir();
      const imagePath = joinStoragePath(privateDir, asset.imageKey);
      const imageBuffer = await objectStorage.downloadBuffer(imagePath);

      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.send(imageBuffer);
    } catch (error) {
      console.error("Error serving signature image:", error);
      res.status(500).json({ error: "Failed to load signature image" });
    }
  });

  // Download signed PDF
  app.get("/api/documents/:id/signed.pdf", validateToken, async (req: Request, res: Response) => {
    try {
      const document = (req as any).document;

      if (document.status !== "completed" || !document.signedPdfKey) {
        return res.status(404).json({ error: "Signed PDF not available" });
      }

      const privateDir = objectStorage.getPrivateObjectDir();
      const signedPath = joinStoragePath(privateDir, document.signedPdfKey);
      const signedPdfBuffer = await objectStorage.downloadBuffer(signedPath);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="signed-${document.id}.pdf"`
      );
      res.send(signedPdfBuffer);
    } catch (error) {
      console.error("Error downloading signed PDF:", error);
      res.status(500).json({ error: "Failed to download signed PDF" });
    }
  });


  // Webhook test endpoint (for development)
  app.post("/api/webhook-test", (req: Request, res: Response) => {
    console.log("=== WEBHOOK RECEIVED ===");
    console.log("Headers:", req.headers);
    console.log("Body:", req.body);
    console.log("========================");
    res.json({ received: true });
  });

  // ============ BOLDSIGN COMPATIBILITY ENDPOINTS ============

  // BoldSign-compatible: Get embedded signing link
  // GET /api/document/getEmbeddedSignLink?documentId=...&signerEmail=...
  app.get("/api/document/getEmbeddedSignLink", validateInternalApiKey, async (req: Request, res: Response) => {
    try {
      const documentId = req.query.documentId as string;
      const signerEmail = req.query.signerEmail as string;

      if (!documentId) {
        return res.status(400).json({ error: "documentId required" });
      }

      const document = await storage.getDocument(documentId);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }

      const baseUrl = process.env.BASE_URL || `https://${req.headers.host}`;
      let signLink: string;

      // Check for multi-signer: look up signer by email if provided
      if (signerEmail) {
        const signer = await storage.getDocumentSignerByEmail(documentId, signerEmail);
        if (signer) {
          signLink = `${baseUrl}/d/${document.id}?token=${signer.token}`;
          console.log(`[BoldSign Compat] Multi-signer link for ${signerEmail}`);
        } else {
          // Fallback to document-level token if no signer record found
          signLink = `${baseUrl}/d/${document.id}?token=${document.signingToken}`;
          console.log(`[BoldSign Compat] No signer found for ${signerEmail}, using document token`);
        }
      } else {
        // Single-signer: use document-level token
        signLink = `${baseUrl}/d/${document.id}?token=${document.signingToken}`;
      }

      // Log audit event
      await logAuditEvent(document.id, "embedded_link_requested", req, { 
        signerEmail: signerEmail || "not_provided" 
      });

      console.log(`[BoldSign Compat] Embedded link requested for ${documentId}${signerEmail ? ` (signer: ${signerEmail})` : ""}`);

      res.json({ signLink });
    } catch (error) {
      console.error("Error getting embedded sign link:", error);
      res.status(500).json({ error: "Failed to get embedded sign link" });
    }
  });

  // BoldSign-compatible: Download signed document
  // GET /api/document/download?documentId=...
  app.get("/api/document/download", validateInternalApiKey, async (req: Request, res: Response) => {
    try {
      const documentId = req.query.documentId as string;

      if (!documentId) {
        return res.status(400).json({ error: "documentId required" });
      }

      const document = await storage.getDocument(documentId);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }

      if (document.status !== "completed" || !document.signedPdfKey) {
        return res.status(409).json({ error: "Document not yet completed" });
      }

      // Log audit event
      await logAuditEvent(document.id, "internal_download", req);

      const privateDir = objectStorage.getPrivateObjectDir();
      const signedPath = joinStoragePath(privateDir, document.signedPdfKey);
      const signedPdfBuffer = await objectStorage.downloadBuffer(signedPath);

      console.log(`[BoldSign Compat] Internal download for ${documentId}`);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="signed-${document.id}.pdf"`
      );
      res.send(signedPdfBuffer);
    } catch (error) {
      console.error("Error downloading document:", error);
      res.status(500).json({ error: "Failed to download document" });
    }
  });

  // ============ ADMIN ENDPOINTS ============

  // Get all documents for authenticated user (admin dashboard) - includes team documents
  app.get("/api/admin/documents", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Get accessible user IDs (self + team members)
      const accessibleUserIds = await getAccessibleUserIds(userId);
      
      // Fetch documents from all accessible users
      let allDocuments: any[] = [];
      for (const uid of accessibleUserIds) {
        const docs = await storage.getDocumentsByUser(uid);
        allDocuments = allDocuments.concat(docs);
      }
      
      // Sort by createdAt descending
      allDocuments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      res.json(allDocuments);
    } catch (error) {
      console.error("Error fetching admin documents:", error);
      res.status(500).json({ error: "Failed to fetch documents" });
    }
  });

  // Get single document detail for admin
  app.get("/api/admin/documents/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.id;
      const documentId = req.params.id;

      const document = await storage.getDocument(documentId);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }

      // Verify ownership or team membership
      const hasAccess = await canAccessUserDocuments(userId, document.userId);
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Get signature assets and audit events
      const signatureAssets = await storage.getSignatureAssets(documentId);
      const auditEvents = await storage.getAuditEvents(documentId);

      res.json({
        ...document,
        signatureAssets,
        auditEvents,
      });
    } catch (error) {
      console.error("Error fetching document detail:", error);
      res.status(500).json({ error: "Failed to fetch document" });
    }
  });

  // Archive a document
  app.post("/api/admin/documents/:id/archive", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.id;
      const documentId = req.params.id;

      const document = await storage.getDocument(documentId);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }

      // Verify ownership or team membership
      const hasAccess = await canAccessUserDocuments(userId, document.userId);
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (document.status === "completed") {
        return res.status(400).json({ error: "Cannot archive completed documents" });
      }

      const updated = await storage.updateDocument(documentId, {
        archivedAt: new Date(),
      });

      res.json({ success: true, document: updated });
    } catch (error) {
      console.error("Error archiving document:", error);
      res.status(500).json({ error: "Failed to archive document" });
    }
  });

  // Unarchive a document
  app.post("/api/admin/documents/:id/unarchive", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.id;
      const documentId = req.params.id;

      const document = await storage.getDocument(documentId);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }

      // Verify ownership or team membership
      const hasAccess = await canAccessUserDocuments(userId, document.userId);
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      const updated = await storage.updateDocument(documentId, {
        archivedAt: null,
      });

      res.json({ success: true, document: updated });
    } catch (error) {
      console.error("Error unarchiving document:", error);
      res.status(500).json({ error: "Failed to unarchive document" });
    }
  });

  // Admin endpoint to view/download signed PDF
  app.get("/api/admin/documents/:id/signed.pdf", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.id;
      const documentId = req.params.id;
      const download = req.query.download === "true";

      const document = await storage.getDocument(documentId);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }

      // Verify ownership or team membership
      const hasAccess = await canAccessUserDocuments(userId, document.userId);
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (document.status !== "completed" || !document.signedPdfKey) {
        return res.status(400).json({ error: "Document not completed or signed PDF not available" });
      }

      const pdfBuffer = await objectStorage.downloadBuffer(document.signedPdfKey);
      
      res.setHeader("Content-Type", "application/pdf");
      if (download) {
        res.setHeader("Content-Disposition", `attachment; filename="signed-${documentId}.pdf"`);
      } else {
        res.setHeader("Content-Disposition", `inline; filename="signed-${documentId}.pdf"`);
      }
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error fetching signed PDF:", error);
      res.status(500).json({ error: "Failed to fetch signed PDF" });
    }
  });

  // Create document as authenticated user
  app.post("/api/admin/documents", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Admin accounts cannot create documents - they are for platform management only
      const user = await authStorage.getUser(userId);
      if (user?.isAdmin) {
        return res.status(403).json({ error: "Admin accounts cannot create documents. Admin accounts are for platform management only." });
      }

      // Check document usage limits for free accounts
      const usage = await authStorage.checkDocumentUsage(userId);
      if (!usage.canCreate) {
        return res.status(403).json({
          error: "Document limit reached",
          message: `You have reached your monthly limit of ${usage.limit} documents. Upgrade to Pro for unlimited documents.`,
          usage: { used: usage.used, limit: usage.limit, accountType: usage.accountType },
        });
      }

      const parseResult = createDocumentRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          error: "Invalid request",
          details: parseResult.error.errors,
        });
      }

      const { template_id, data, callback_url } = parseResult.data;

      // Generate signing token
      const signingToken = nanoid(32);

      // Render document from template (supports both HTML and PDF templates)
      console.log(`Rendering document from template: ${template_id} (user: ${userId})`);
      const pdfBuffer = await renderDocumentFromTemplate(template_id, data);

      // Upload unsigned PDF to object storage
      const unsignedPdfKey = `documents/${nanoid()}/unsigned.pdf`;
      await objectStorage.uploadBuffer(pdfBuffer, unsignedPdfKey, "application/pdf");

      // Create document record with userId
      const document = await storage.createDocument({
        userId,
        templateId: template_id,
        status: "created",
        dataJson: data,
        callbackUrl: callback_url || null,
        signingToken,
        unsignedPdfKey,
        signedPdfKey: null,
        signedPdfSha256: null,
      });

      // Log audit event
      await logAuditEvent(document.id, "document_created", req, { template_id, userId });

      // Increment document count for free users
      await authStorage.incrementDocumentCount(userId);

      const baseUrl = process.env.BASE_URL || `https://${req.headers.host}`;
      const signingUrl = `${baseUrl}/d/${document.id}?token=${signingToken}`;

      console.log(`Admin document created: ${document.id} by user ${userId}`);

      res.status(201).json({
        document_id: document.id,
        signing_url: signingUrl,
        status: document.status,
      });
    } catch (error) {
      console.error("Error creating admin document:", error);
      res.status(500).json({ error: "Failed to create document" });
    }
  });

  // Bulk create documents from array of data (Pro feature)
  app.post("/api/admin/documents/bulk", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Check if user has Pro subscription for bulk import
      const user = await authStorage.getUser(userId);
      
      // Admin accounts cannot create documents - they are for platform management only
      if (user?.isAdmin) {
        return res.status(403).json({ error: "Admin accounts cannot create documents. Admin accounts are for platform management only." });
      }
      
      if (user?.accountType !== "pro") {
        return res.status(403).json({ 
          error: "Bulk import is a Pro feature. Please upgrade your subscription to use this feature." 
        });
      }

      const { template_id, documents: documentDataArray, send_emails } = req.body;

      if (!template_id || !Array.isArray(documentDataArray) || documentDataArray.length === 0) {
        return res.status(400).json({ 
          error: "template_id and non-empty documents array are required" 
        });
      }

      if (documentDataArray.length > 50) {
        return res.status(400).json({ 
          error: "Maximum 50 documents can be created at once" 
        });
      }

      const results: Array<{
        success: boolean;
        document_id?: string;
        signing_url?: string;
        email_sent?: boolean;
        error?: string;
        row_index: number;
      }> = [];

      const baseUrl = process.env.BASE_URL || `https://${req.headers.host}`;

      for (let i = 0; i < documentDataArray.length; i++) {
        const data = documentDataArray[i];
        
        try {
          // Generate signing token
          const signingToken = nanoid(32);

          // Render document from template (supports both HTML and PDF templates)
          const pdfBuffer = await renderDocumentFromTemplate(template_id, data);

          // Upload unsigned PDF to object storage
          const unsignedPdfKey = `documents/${nanoid()}/unsigned.pdf`;
          await objectStorage.uploadBuffer(pdfBuffer, unsignedPdfKey, "application/pdf");

          // Create document record with userId
          const document = await storage.createDocument({
            userId,
            templateId: template_id,
            status: "created",
            dataJson: data,
            callbackUrl: null,
            signingToken,
            unsignedPdfKey,
            signedPdfKey: null,
            signedPdfSha256: null,
          });

          // Log audit event
          await logAuditEvent(document.id, "document_created", req, { 
            template_id, 
            userId, 
            bulk_create: true,
            row_index: i 
          });

          const signingUrl = `${baseUrl}/d/${document.id}?token=${signingToken}`;
          
          let emailSent = false;
          
          // Optionally send email if recipient email is in data
          if (send_emails && data.tenant_email) {
            try {
              await sendSignatureRequestEmail(
                document, 
                data.tenant_email, 
                data.tenant_name || "Tenant"
              );
              await storage.updateDocument(document.id, { status: "sent" });
              await logAuditEvent(document.id, "email_sent", req, { 
                recipientEmail: data.tenant_email,
                emailType: "signature_request"
              });
              emailSent = true;
            } catch (emailError) {
              console.error(`Failed to send email for bulk document ${i}:`, emailError);
            }
          }

          results.push({
            success: true,
            document_id: document.id,
            signing_url: signingUrl,
            email_sent: emailSent,
            row_index: i,
          });

        } catch (docError) {
          console.error(`Error creating bulk document ${i}:`, docError);
          results.push({
            success: false,
            error: docError instanceof Error ? docError.message : "Unknown error",
            row_index: i,
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;

      console.log(`Bulk create: ${successCount} success, ${failureCount} failures by user ${userId}`);

      res.status(201).json({
        total: documentDataArray.length,
        success_count: successCount,
        failure_count: failureCount,
        results,
      });
    } catch (error) {
      console.error("Error in bulk document creation:", error);
      res.status(500).json({ error: "Failed to create documents" });
    }
  });

  // Create document from PDF template with creator-filled fields
  app.post("/api/admin/documents/from-template", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Admin accounts cannot create documents - they are for platform management only
      const user = await authStorage.getUser(userId);
      if (user?.isAdmin) {
        return res.status(403).json({ error: "Admin accounts cannot create documents. Admin accounts are for platform management only." });
      }

      const { templateId, signers, creatorFieldValues, sendEmail } = req.body;

      if (!templateId) {
        return res.status(400).json({ error: "Template ID is required" });
      }

      if (!signers || !Array.isArray(signers) || signers.length === 0) {
        return res.status(400).json({ error: "At least one signer is required" });
      }

      // Fetch template
      const template = await storage.getTemplateById(templateId);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }

      if (template.templateType !== "pdf" || !template.pdfKey) {
        return res.status(400).json({ error: "Template must be a PDF template" });
      }

      // Fetch template fields
      const templateFields = await storage.getTemplateFields(templateId);

      // Download the template PDF
      const pdfBuffer = await objectStorage.downloadBuffer(template.pdfKey);

      // Stamp creator-filled fields onto the PDF
      let modifiedPdfBuffer = pdfBuffer;
      
      const creatorFillFields = templateFields.filter(f => f.creatorFills);
      if (creatorFillFields.length > 0 && creatorFieldValues) {
        const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");
        const pdfDoc = await PDFDocument.load(pdfBuffer);
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const pages = pdfDoc.getPages();

        for (const field of creatorFillFields) {
          const value = creatorFieldValues[field.apiTag];
          if (!value) continue;

          const pageIndex = field.page - 1;
          if (pageIndex < 0 || pageIndex >= pages.length) continue;

          const page = pages[pageIndex];
          const pageHeight = page.getHeight();
          
          // Convert from top-origin to bottom-origin
          const x = Number(field.x);
          const y = pageHeight - Number(field.y) - Number(field.height);
          const fontSize = field.fontSize || 12;

          if (field.fieldType === "checkbox") {
            if (value === "true") {
              // Draw an X checkmark (guaranteed to render in Helvetica)
              page.drawText("X", {
                x: x + 2,
                y: y + 2,
                size: Math.min(Number(field.width), Number(field.height)) * 0.7,
                font,
                color: rgb(0, 0, 0),
              });
            }
          } else if (field.fieldType === "date") {
            // Format the date nicely
            const dateValue = new Date(value);
            const formattedDate = !isNaN(dateValue.getTime()) 
              ? dateValue.toLocaleDateString("en-US") 
              : value;
            page.drawText(formattedDate, {
              x,
              y: y + 4,
              size: fontSize,
              font,
              color: rgb(0, 0, 0),
            });
          } else {
            // Text field
            page.drawText(value, {
              x,
              y: y + 4,
              size: fontSize,
              font,
              color: rgb(0, 0, 0),
            });
          }
        }

        modifiedPdfBuffer = Buffer.from(await pdfDoc.save());
      }

      // Upload the modified PDF
      const unsignedPdfKey = `documents/${nanoid()}/unsigned.pdf`;
      await objectStorage.uploadBuffer(modifiedPdfBuffer, unsignedPdfKey, "application/pdf");

      // Generate document-level signing token
      const signingToken = nanoid(32);

      // Create document record
      const document = await storage.createDocument({
        userId,
        templateId,
        status: "created",
        dataJson: {
          signers,
          creatorFieldValues,
          fromTemplate: true,
        },
        callbackUrl: null,
        signingToken,
        unsignedPdfKey,
        signedPdfKey: null,
        signedPdfSha256: null,
      });

      console.log(`[From Template] Document created: ${document.id} from template ${templateId}`);

      await logAuditEvent(document.id, "document_created", req, { 
        userId, 
        templateId,
        signerCount: signers.length,
      });

      const baseUrl = process.env.BASE_URL || `https://${req.headers.host}`;
      const signerLinks: Array<{ email: string; name: string; role: string; signLink: string }> = [];

      // Sort signers by provided orderIndex for sequential signing
      const sortedSigners = [...signers].sort((a, b) => {
        const aOrder = typeof a.orderIndex === "number" ? a.orderIndex : signers.indexOf(a);
        const bOrder = typeof b.orderIndex === "number" ? b.orderIndex : signers.indexOf(b);
        return aOrder - bOrder;
      });

      // Create signer records and signature spots from template fields
      for (let i = 0; i < sortedSigners.length; i++) {
        const signer = sortedSigners[i];
        const signerToken = nanoid(32);
        const orderIndex = typeof signer.orderIndex === "number" ? signer.orderIndex : i;
        
        await storage.createDocumentSigner({
          documentId: document.id,
          email: signer.email,
          name: signer.name,
          role: signer.role,
          token: signerToken,
          status: "pending",
          orderIndex,
        });

        // Create signature spots for this signer's role (excluding creatorFills fields)
        const signerFields = templateFields.filter(
          f => f.signerRole === signer.role && !f.creatorFills
        );

        for (const field of signerFields) {
          const spotKey = `${document.id}_${signer.role}_${field.apiTag}`;
          await storage.createSignatureSpot({
            documentId: document.id,
            key: spotKey,
            fieldType: field.fieldType,
            label: field.label || field.apiTag,
            page: field.page,
            x: Number(field.x),
            y: Number(field.y),
            width: Number(field.width),
            height: Number(field.height),
            signerRole: signer.role,
            required: field.required ?? true,
          });
        }

        const signLink = `${baseUrl}/d/${document.id}?token=${signerToken}`;
        signerLinks.push({
          email: signer.email,
          name: signer.name,
          role: signer.role,
          signLink,
        });

        await logAuditEvent(document.id, "signer_added", req, { 
          signerEmail: signer.email, 
          signerRole: signer.role,
        });
      }

      // Send emails if requested
      let emailsSent = false;
      if (sendEmail) {
        // Send to first signer only (sequential signing - others get notified when previous completes)
        const firstSignerLink = signerLinks[0];
        if (firstSignerLink) {
          try {
            await sendSigningEmail(
              firstSignerLink.email,
              firstSignerLink.name,
              firstSignerLink.signLink,
              `Document: ${template.name}`
            );
            emailsSent = true;
            await logAuditEvent(document.id, "email_sent", req, {
              signerEmail: firstSignerLink.email,
            });
          } catch (emailError) {
            console.error("Error sending email:", emailError);
          }
        }
      }

      res.status(201).json({
        document_id: document.id,
        documentId: document.id,
        signers: signerLinks,
        status: "created",
        emailsSent,
      });
    } catch (error) {
      console.error("Error creating document from template:", error);
      res.status(500).json({ error: "Failed to create document" });
    }
  });

  // Create one-off document (no template, direct PDF upload with signers and fields)
  app.post("/api/admin/documents/one-off", isAuthenticated, upload.single("pdf"), async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Admin accounts cannot create documents - they are for platform management only
      const userRecord = await authStorage.getUser(userId);
      if (userRecord?.isAdmin) {
        return res.status(403).json({ error: "Admin accounts cannot create documents. Admin accounts are for platform management only." });
      }

      // Check document usage limits for free accounts
      const usage = await authStorage.checkDocumentUsage(userId);
      if (!usage.canCreate) {
        return res.status(403).json({
          error: "Document limit reached",
          message: `You have reached your monthly limit of ${usage.limit} documents. Upgrade to Pro for unlimited documents.`,
          usage: { used: usage.used, limit: usage.limit, accountType: usage.accountType },
        });
      }

      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "PDF file is required" });
      }

      // Parse signers and fields from form data
      let signers: Array<{ name: string; email: string; id: string }>;
      let fields: Array<{
        id: string;
        fieldType: string;
        signerId: string;
        page: number;
        x: number;
        y: number;
        width: number;
        height: number;
        required: boolean;
        label?: string;
        placeholder?: string;
        inputMode?: string;
        creatorFills?: boolean;
        creatorValue?: string;
      }>;
      let documentTitle: string;
      let sendEmails: boolean;

      try {
        signers = JSON.parse(req.body.signers || "[]");
        fields = JSON.parse(req.body.fields || "[]");
        documentTitle = req.body.title || "Document";
        sendEmails = req.body.sendEmails === "true";
      } catch (parseError) {
        return res.status(400).json({ error: "Invalid JSON in signers or fields" });
      }

      // Validate signers
      if (!Array.isArray(signers) || signers.length === 0) {
        return res.status(400).json({ error: "At least one signer is required" });
      }

      for (const signer of signers) {
        if (!signer.name || !signer.email || !signer.id) {
          return res.status(400).json({ error: "Each signer must have name, email, and id" });
        }
      }

      // Validate fields
      if (!Array.isArray(fields)) {
        return res.status(400).json({ error: "Fields must be an array" });
      }

      for (const field of fields) {
        if (!field.signerId || !field.fieldType || typeof field.page !== "number") {
          return res.status(400).json({ error: "Each field must have signerId, fieldType, and page" });
        }
        // Verify signer exists
        if (!signers.find(s => s.id === field.signerId)) {
          return res.status(400).json({ error: `Field references unknown signer: ${field.signerId}` });
        }
        // Reject creatorFills on signature/initial fields - those must always be filled by signers
        if (field.creatorFills && (field.fieldType === "signature" || field.fieldType === "initial")) {
          return res.status(400).json({ 
            error: "Signature and initial fields cannot be set as 'Creator Fills'. Only text, date, and checkbox fields can be pre-filled by the creator." 
          });
        }
      }

      // Stamp creator-filled fields onto the PDF before uploading
      let pdfBuffer = file.buffer;
      const creatorFillFields = fields.filter(f => f.creatorFills && f.creatorValue);
      
      if (creatorFillFields.length > 0) {
        console.log(`[One-Off] Stamping ${creatorFillFields.length} creator-filled fields onto PDF`);
        const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");
        const pdfDoc = await PDFDocument.load(pdfBuffer);
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const pages = pdfDoc.getPages();

        for (const field of creatorFillFields) {
          const value = field.creatorValue;
          if (!value) continue;

          const page = pages[field.page - 1];
          if (!page) continue;

          const pageHeight = page.getHeight();
          // Convert top-origin to bottom-origin for pdf-lib
          const pdfY = pageHeight - field.y - field.height;

          if (field.fieldType === "text" || field.fieldType === "date") {
            const fontSize = Math.min(field.height * 0.7, 12);
            page.drawText(value, {
              x: field.x + 2,
              y: pdfY + field.height * 0.3,
              size: fontSize,
              font,
              color: rgb(0, 0, 0),
            });
          } else if (field.fieldType === "checkbox") {
            if (value === "true" || value === "checked" || value === "1") {
              const fontSize = field.height * 0.8;
              page.drawText("X", {
                x: field.x + field.width * 0.25,
                y: pdfY + field.height * 0.15,
                size: fontSize,
                font,
                color: rgb(0, 0, 0),
              });
            }
          }
        }

        pdfBuffer = Buffer.from(await pdfDoc.save());
        console.log(`[One-Off] Creator-filled fields stamped successfully`);
      }

      // Upload PDF to object storage
      const unsignedPdfKey = `documents/${nanoid()}/unsigned.pdf`;
      await objectStorage.uploadBuffer(pdfBuffer, unsignedPdfKey, "application/pdf");
      console.log(`[One-Off] Uploaded PDF: ${unsignedPdfKey}`);

      // Generate document-level signing token (for backward compatibility)
      const signingToken = nanoid(32);

      // Create document record with null templateId
      const document = await storage.createDocument({
        userId,
        templateId: null,
        status: "created",
        dataJson: {
          title: documentTitle,
          signers,
          fields,
          oneOffDocument: true,
        },
        callbackUrl: null,
        signingToken,
        unsignedPdfKey,
        signedPdfKey: null,
        signedPdfSha256: null,
      });

      console.log(`[One-Off] Document created: ${document.id}`);

      // Persist creator-filled text/date/checkbox values to storage so signing UI receives them
      for (const field of creatorFillFields) {
        if (field.creatorValue) {
          await storage.saveTextFieldValue({
            documentId: document.id,
            spotKey: field.id,
            value: field.creatorValue,
            fieldType: field.fieldType,
            signerRole: "creator",
            signerEmail: "creator@system",
          });
          console.log(`[One-Off] Persisted creator-filled value for field ${field.id}`);
        }
      }

      // Log audit event
      await logAuditEvent(document.id, "document_created", req, { 
        userId, 
        oneOffDocument: true,
        signerCount: signers.length,
        fieldCount: fields.length,
        creatorFilledCount: creatorFillFields.length,
      });

      // Increment document count for free users
      await authStorage.incrementDocumentCount(userId);

      const baseUrl = process.env.BASE_URL || `https://${req.headers.host}`;
      const signerLinks: Array<{ id: string; email: string; name: string; signLink: string; emailSent: boolean }> = [];

      // Create signer records with order and only send email to first signer
      for (let orderIndex = 0; orderIndex < signers.length; orderIndex++) {
        const signer = signers[orderIndex];
        const signerToken = nanoid(32);
        await storage.createDocumentSigner({
          documentId: document.id,
          email: signer.email,
          name: signer.name,
          role: signer.id, // Use signer.id as "role" for field matching
          token: signerToken,
          status: "pending",
          orderIndex, // Track signing order
        });

        const signLink = `${baseUrl}/d/${document.id}?token=${signerToken}`;
        let emailSent = false;

        // Only send email to the first signer (orderIndex 0) for sequential signing
        if (sendEmails && orderIndex === 0) {
          try {
            const { sendSignatureRequestEmailWithUrl } = await import("./services/emailService");
            await sendSignatureRequestEmailWithUrl(
              document.id,
              signer.email,
              signer.name,
              signLink,
              documentTitle
            );
            emailSent = true;
            console.log(`[One-Off] Email sent to first signer: ${signer.email}`);
          } catch (emailError) {
            console.error(`[One-Off] Failed to send email to ${signer.email}:`, emailError);
          }
        }

        signerLinks.push({
          id: signer.id,
          email: signer.email,
          name: signer.name,
          signLink,
          emailSent,
        });

        await logAuditEvent(document.id, "signer_added", req, { 
          signerEmail: signer.email, 
          signerRole: signer.id,
          orderIndex,
        });
      }

      // Update status to 'sent' if emails were dispatched
      if (sendEmails && signerLinks.some(s => s.emailSent)) {
        await storage.updateDocument(document.id, { status: "sent" });
      }

      console.log(`[One-Off] Document ${document.id} created with ${signers.length} signers`);

      res.status(201).json({
        success: true,
        document_id: document.id,
        documentId: document.id,
        title: documentTitle,
        signers: signerLinks,
        status: sendEmails ? "sent" : "created",
      });
    } catch (error) {
      console.error("[One-Off] Error creating document:", error);
      res.status(500).json({ error: "Failed to create one-off document" });
    }
  });

  // ============ STORAGE SETTINGS ENDPOINTS ============

  // Get current storage settings for user
  app.get("/api/storage/settings", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const user = await authStorage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const credentials = await authStorage.getAllStorageCredentials(userId);
      const connectedProviders = credentials.map(c => ({
        provider: c.provider,
        email: c.providerEmail,
        connectedAt: c.createdAt,
      }));

      const { getAvailableProviders, isProviderConfigured, isS3StorageAvailable } = await import("./services/externalStorage");
      const { isS3StorageAvailable: s3Available } = await import("./services/storageBackend");

      const providers = getAvailableProviders().map(p => ({
        ...p,
        connected: p.provider === "fairsign" 
          ? true 
          : connectedProviders.some(c => c.provider === p.provider),
        configured: isProviderConfigured(p.provider),
        connectedEmail: connectedProviders.find(c => c.provider === p.provider)?.email,
      }));

      res.json({
        currentProvider: user.storageProvider || "fairsign",
        encryptionEnabled: !!(user.encryptionKeyId),
        encryptionSalt: user.encryptionKeySalt,
        providers,
        s3Available: s3Available(),
      });
    } catch (error) {
      console.error("Error fetching storage settings:", error);
      res.status(500).json({ error: "Failed to fetch storage settings" });
    }
  });

  // Update storage provider preference
  app.post("/api/storage/settings", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const { updateStoragePreferenceSchema } = await import("@shared/models/auth");
      const parsed = updateStoragePreferenceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
      }

      const { storageProvider } = parsed.data;

      // Verify provider is connected (except for fairsign which is always available)
      if (storageProvider !== "fairsign") {
        const creds = await authStorage.getStorageCredentials(userId, storageProvider);
        if (!creds) {
          return res.status(400).json({ error: `Please connect your ${storageProvider} account first` });
        }
      }

      const user = await authStorage.updateStorageProvider(userId, storageProvider);
      res.json({ success: true, storageProvider: user?.storageProvider });
    } catch (error) {
      console.error("Error updating storage settings:", error);
      res.status(500).json({ error: "Failed to update storage settings" });
    }
  });

  // Setup encryption for FairSign storage
  app.post("/api/storage/encryption/setup", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const { salt } = req.body;
      if (!salt) {
        return res.status(400).json({ error: "Salt is required" });
      }

      const keyId = `enc_${userId}_${Date.now()}`;
      const user = await authStorage.updateEncryptionKey(userId, keyId, salt);
      
      res.json({ 
        success: true, 
        encryptionKeyId: keyId,
        message: "Encryption key setup complete. Your documents will now be encrypted."
      });
    } catch (error) {
      console.error("Error setting up encryption:", error);
      res.status(500).json({ error: "Failed to setup encryption" });
    }
  });

  // ============ USER ACCOUNT DELETION ============
  
  // User self-deletion (soft delete with 30-day grace period)
  app.delete("/api/account", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const user = await authStorage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (user.isAdmin) {
        return res.status(400).json({ error: "Admin accounts cannot be self-deleted" });
      }

      if (user.deletedAt) {
        return res.status(400).json({ error: "Account is already scheduled for deletion" });
      }

      // Calculate scheduled deletion date
      // For paid users with active subscription, deletion starts when subscription ends
      let scheduledDeletionDate = new Date();
      let gracePeriodStart = new Date();
      
      if (user.accountType === "pro" && 
          user.subscriptionCurrentPeriodEnd && 
          user.subscriptionCurrentPeriodEnd > new Date()) {
        // Account stays active until subscription ends, then 30-day grace period
        gracePeriodStart = new Date(user.subscriptionCurrentPeriodEnd);
        scheduledDeletionDate = new Date(user.subscriptionCurrentPeriodEnd);
      }
      scheduledDeletionDate.setDate(scheduledDeletionDate.getDate() + 30);

      // Import db and users for update
      const { db } = await import("./db");
      const { users } = await import("@shared/models/auth");
      const { eq } = await import("drizzle-orm");

      await db.update(users).set({
        deletedAt: new Date(),
        scheduledDeletionDate,
        deletionReason: "User requested deletion",
        updatedAt: new Date(),
      }).where(eq(users.id, userId));

      // Send confirmation email
      try {
        const { sendAccountDeletionEmail } = await import("./services/emailService");
        await sendAccountDeletionEmail(
          user.email,
          user.firstName || "User",
          scheduledDeletionDate,
          gracePeriodStart > new Date() ? gracePeriodStart : null
        );
      } catch (emailError) {
        console.error("Failed to send account deletion email:", emailError);
        // Don't fail the deletion if email fails
      }

      res.json({ 
        success: true, 
        message: "Your account has been scheduled for deletion.",
        scheduledDeletionDate,
        gracePeriodStart: gracePeriodStart > new Date() ? gracePeriodStart : new Date(),
      });
    } catch (error) {
      console.error("Error deleting account:", error);
      res.status(500).json({ error: "Failed to delete account" });
    }
  });

  // Get OAuth URL for external storage provider
  app.get("/api/storage/oauth/:provider", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const provider = req.params.provider as "google_drive" | "dropbox" | "box";
      if (!["google_drive", "dropbox", "box"].includes(provider)) {
        return res.status(400).json({ error: "Invalid provider" });
      }

      const { generateOAuthUrl, isProviderConfigured } = await import("./services/externalStorage");
      
      if (!isProviderConfigured(provider)) {
        return res.status(400).json({ 
          error: `${provider} is not configured. Please add the required API credentials.` 
        });
      }

      const state = Buffer.from(JSON.stringify({ userId, provider })).toString("base64");
      const authUrl = generateOAuthUrl(provider, state);

      if (!authUrl) {
        return res.status(500).json({ error: "Failed to generate OAuth URL" });
      }

      res.json({ authUrl });
    } catch (error) {
      console.error("Error generating OAuth URL:", error);
      res.status(500).json({ error: "Failed to generate OAuth URL" });
    }
  });

  // OAuth callback handler
  app.get("/api/storage/oauth/callback/:provider", async (req: Request, res: Response) => {
    try {
      const provider = req.params.provider as "google_drive" | "dropbox" | "box";
      const { code, state } = req.query;

      if (!code || !state) {
        return res.redirect("/storage-settings?error=missing_params");
      }

      let stateData: { userId: string; provider: string };
      try {
        stateData = JSON.parse(Buffer.from(state as string, "base64").toString());
      } catch {
        return res.redirect("/storage-settings?error=invalid_state");
      }

      if (stateData.provider !== provider) {
        return res.redirect("/storage-settings?error=provider_mismatch");
      }

      const { 
        exchangeCodeForTokens, 
        encryptToken, 
        getUserInfoFromProvider 
      } = await import("./services/externalStorage");

      const tokens = await exchangeCodeForTokens(provider, code as string);
      if (!tokens) {
        return res.redirect("/storage-settings?error=token_exchange_failed");
      }

      const userInfo = await getUserInfoFromProvider(provider, tokens.access_token);

      await authStorage.saveStorageCredential({
        userId: stateData.userId,
        provider,
        accessTokenEncrypted: encryptToken(tokens.access_token, stateData.userId),
        refreshTokenEncrypted: tokens.refresh_token ? encryptToken(tokens.refresh_token, stateData.userId) : null,
        tokenExpiresAt: tokens.expires_in 
          ? new Date(Date.now() + tokens.expires_in * 1000) 
          : null,
        providerUserId: userInfo?.userId || null,
        providerEmail: userInfo?.email || null,
        folderPath: null,
        isActive: true,
      });

      res.redirect(`/storage-settings?success=connected&provider=${provider}`);
    } catch (error) {
      console.error("OAuth callback error:", error);
      res.redirect("/storage-settings?error=callback_failed");
    }
  });

  // Disconnect external storage provider
  app.delete("/api/storage/oauth/:provider", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const provider = req.params.provider;
      if (!["google_drive", "dropbox", "box"].includes(provider)) {
        return res.status(400).json({ error: "Invalid provider" });
      }

      // Check if this is the current storage provider
      const user = await authStorage.getUser(userId);
      if (user?.storageProvider === provider) {
        // Switch to fairsign before disconnecting
        await authStorage.updateStorageProvider(userId, "fairsign");
      }

      await authStorage.deleteStorageCredential(userId, provider);
      res.json({ success: true });
    } catch (error) {
      console.error("Error disconnecting provider:", error);
      res.status(500).json({ error: "Failed to disconnect provider" });
    }
  });

  // ============ TEMPLATE ENDPOINTS ============

  // Get all templates for authenticated user (includes default templates and team templates)
  app.get("/api/admin/templates", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Get accessible user IDs (self + team members)
      const accessibleUserIds = await getAccessibleUserIds(userId);
      
      // Fetch templates from all accessible users
      let allTemplates: any[] = [];
      const seenIds = new Set<string>();
      
      for (const uid of accessibleUserIds) {
        const templates = await storage.getTemplatesForUser(uid);
        for (const t of templates) {
          if (!seenIds.has(t.id)) {
            seenIds.add(t.id);
            allTemplates.push(t);
          }
        }
      }
      
      res.json(allTemplates);
    } catch (error) {
      console.error("Error fetching templates:", error);
      res.status(500).json({ error: "Failed to fetch templates" });
    }
  });

  // Get single template
  app.get("/api/admin/templates/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.id;
      const templateId = req.params.id;

      const template = await storage.getTemplate(templateId);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }

      // Allow access if user owns template, it's a default template, or user is in same team
      const hasAccess = await canAccessTemplate(userId, template.userId, template.isDefault);
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      res.json(template);
    } catch (error) {
      console.error("Error fetching template:", error);
      res.status(500).json({ error: "Failed to fetch template" });
    }
  });

  // Create new template
  app.post("/api/admin/templates", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const { name, description, htmlContent, placeholders } = req.body;

      if (!name || !htmlContent) {
        return res.status(400).json({ error: "Name and HTML content are required" });
      }

      // Extract placeholders from HTML if not provided
      const extractedPlaceholders = placeholders || extractPlaceholders(htmlContent);

      const template = await storage.createTemplate({
        userId,
        name,
        description: description || null,
        htmlContent,
        placeholders: extractedPlaceholders,
        isDefault: false,
      });

      console.log(`Template created: ${template.id} by user ${userId}`);

      res.status(201).json(template);
    } catch (error) {
      console.error("Error creating template:", error);
      res.status(500).json({ error: "Failed to create template" });
    }
  });

  // Update template
  app.patch("/api/admin/templates/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.id;
      const templateId = req.params.id;

      const template = await storage.getTemplate(templateId);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }

      // Only owner or team member can edit (not default templates)
      const hasAccess = await canAccessUserDocuments(userId, template.userId);
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { name, description, htmlContent, placeholders } = req.body;

      const updates: any = {};
      if (name) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (htmlContent) {
        updates.htmlContent = htmlContent;
        updates.placeholders = placeholders || extractPlaceholders(htmlContent);
      }

      const updatedTemplate = await storage.updateTemplate(templateId, updates);

      res.json(updatedTemplate);
    } catch (error) {
      console.error("Error updating template:", error);
      res.status(500).json({ error: "Failed to update template" });
    }
  });

  // Delete template
  app.delete("/api/admin/templates/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.id;
      const templateId = req.params.id;

      const template = await storage.getTemplate(templateId);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }

      // Cannot delete default templates
      if (template.isDefault) {
        return res.status(403).json({ error: "Cannot delete default templates" });
      }

      // Only owner or team member can delete templates
      const hasAccess = await canAccessUserDocuments(userId, template.userId);
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      await storage.deleteTemplate(templateId);

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting template:", error);
      res.status(500).json({ error: "Failed to delete template" });
    }
  });

  // Upload PDF template
  app.post("/api/admin/templates/pdf", isAuthenticated, upload.single("pdf"), async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "PDF file is required" });
      }

      if (!file.mimetype.includes("pdf")) {
        return res.status(400).json({ error: "File must be a PDF" });
      }

      const { name, description } = req.body;
      if (!name) {
        return res.status(400).json({ error: "Template name is required" });
      }

      // Extract page info using pdf-lib
      const { PDFDocument } = await import("pdf-lib");
      const pdfDoc = await PDFDocument.load(file.buffer);
      const pageCount = pdfDoc.getPageCount();
      const pageDimensions: { width: number; height: number }[] = [];

      for (let i = 0; i < pageCount; i++) {
        const page = pdfDoc.getPage(i);
        const { width, height } = page.getSize();
        pageDimensions.push({ width, height });
      }

      // Upload PDF to object storage
      const templateId = nanoid();
      const pdfKey = `templates/${templateId}/original.pdf`;
      const pdfStorageKey = await objectStorage.uploadBuffer(file.buffer, pdfKey, "application/pdf");

      // Create template record
      const template = await storage.createTemplate({
        userId,
        name,
        description: description || null,
        templateType: "pdf",
        htmlContent: null,
        pdfStorageKey,
        pageCount,
        pageDimensions,
        placeholders: [],
        isDefault: false,
      });

      console.log(`PDF template created: ${template.id} with ${pageCount} pages`);

      res.status(201).json(template);
    } catch (error) {
      console.error("Error uploading PDF template:", error);
      res.status(500).json({ error: "Failed to upload PDF template" });
    }
  });

  // Get template fields
  app.get("/api/admin/templates/:id/fields", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.id;
      const templateId = req.params.id;

      const template = await storage.getTemplate(templateId);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }

      // Allow access if user owns template, it's a default template, or user is in same team
      const hasAccess = await canAccessTemplate(userId, template.userId, template.isDefault);
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      const fields = await storage.getTemplateFields(templateId);
      res.json(fields);
    } catch (error) {
      console.error("Error fetching template fields:", error);
      res.status(500).json({ error: "Failed to fetch template fields" });
    }
  });

  // Save template fields (replace all)
  app.put("/api/admin/templates/:id/fields", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.id;
      const templateId = req.params.id;

      const template = await storage.getTemplate(templateId);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }

      // Only owner or team member can edit
      const hasAccess = await canAccessUserDocuments(userId, template.userId);
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (template.templateType !== "pdf") {
        return res.status(400).json({ error: "Fields can only be added to PDF templates" });
      }

      const { fields } = req.body;
      if (!Array.isArray(fields)) {
        return res.status(400).json({ error: "Fields must be an array" });
      }

      // Delete existing fields
      await storage.deleteTemplateFields(templateId);

      // Create new fields
      const createdFields = [];
      for (const field of fields) {
        const created = await storage.createTemplateField({
          templateId,
          apiTag: field.apiTag,
          fieldType: field.fieldType,
          label: field.label || null,
          page: field.page,
          x: field.x,
          y: field.y,
          width: field.width,
          height: field.height,
          signerRole: field.signerRole || "tenant",
          required: field.required !== false,
          fontSize: field.fontSize || 12,
          fontColor: field.fontColor || "#000000",
          inputMode: field.inputMode || "any",
          placeholder: field.placeholder || null,
          creatorFills: field.creatorFills || false,
        });
        createdFields.push(created);
      }

      // Update template placeholders based on fields
      const placeholders = createdFields.map(f => f.apiTag);
      await storage.updateTemplate(templateId, { placeholders });

      res.json(createdFields);
    } catch (error) {
      console.error("Error saving template fields:", error);
      res.status(500).json({ error: "Failed to save template fields" });
    }
  });

  // Get PDF preview URL (legacy - returns S3 URL which may have CORS issues)
  app.get("/api/admin/templates/:id/pdf-url", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.id;
      const templateId = req.params.id;

      const template = await storage.getTemplate(templateId);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }

      // Allow access if user owns template, it's a default template, or user is in same team
      const hasAccess = await canAccessTemplate(userId, template.userId, template.isDefault);
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (template.templateType !== "pdf" || !template.pdfStorageKey) {
        return res.status(400).json({ error: "Template is not a PDF template" });
      }

      const url = await objectStorage.getSignedDownloadUrl(template.pdfStorageKey, 3600);
      res.json({ url });
    } catch (error) {
      console.error("Error getting PDF URL:", error);
      res.status(500).json({ error: "Failed to get PDF URL" });
    }
  });

  // Proxy PDF template - streams PDF through backend to avoid CORS issues
  app.get("/api/admin/templates/:id/pdf", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.id;
      const templateId = req.params.id;

      const template = await storage.getTemplate(templateId);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }

      // Allow access if user owns template, it's a default template, or user is in same team
      const hasAccess = await canAccessTemplate(userId, template.userId, template.isDefault);
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (template.templateType !== "pdf" || !template.pdfStorageKey) {
        return res.status(400).json({ error: "Template is not a PDF template" });
      }

      // Download PDF from storage and stream to client
      const privateDir = objectStorage.getPrivateObjectDir();
      const pdfPath = joinStoragePath(privateDir, template.pdfStorageKey);
      const pdfBuffer = await objectStorage.downloadBuffer(pdfPath);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Length", pdfBuffer.length);
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error streaming PDF:", error);
      res.status(500).json({ error: "Failed to stream PDF" });
    }
  });

  // Get template metadata for external API integration
  app.get("/api/templates/:id/metadata", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.id;
      const templateId = req.params.id;

      const template = await storage.getTemplate(templateId);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }

      // Allow access if user owns template, it's a default template, or user is in same team
      const hasAccess = await canAccessTemplate(userId, template.userId, template.isDefault);
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      const metadata: {
        id: string;
        name: string;
        description: string | null;
        templateType: string;
        pageCount: number | null;
        fields: {
          apiTag: string;
          fieldType: string;
          label: string | null;
          page: number;
          signerRole: string | null;
          required: boolean;
        }[];
        placeholders: string[];
      } = {
        id: template.id,
        name: template.name,
        description: template.description,
        templateType: template.templateType || "html",
        pageCount: template.pageCount,
        fields: [],
        placeholders: (template.placeholders as string[]) || [],
      };

      if (template.templateType === "pdf") {
        const fields = await storage.getTemplateFields(templateId);
        metadata.fields = fields.map((f) => ({
          apiTag: f.apiTag,
          fieldType: f.fieldType,
          label: f.label,
          page: f.page,
          signerRole: f.signerRole,
          required: f.required ?? true,
        }));
      }

      res.json(metadata);
    } catch (error) {
      console.error("Error getting template metadata:", error);
      res.status(500).json({ error: "Failed to get template metadata" });
    }
  });

  // ===== Email Notification Endpoints =====

  // Test email endpoint (development only)
  app.post("/api/test-email", async (req: Request, res: Response) => {
    try {
      const { toEmail, toName } = req.body;
      if (!toEmail) {
        return res.status(400).json({ error: "toEmail is required" });
      }
      
      const { sendEmail } = await import("./services/emailService");
      const { FAIRSIGN_LOGO_SVG } = await import("./services/fairsignLogo");
      const currentYear = new Date().getFullYear();
      const signerName = toName || "Test User";
      const documentTitle = "Test Document - Lease Agreement";
      const signingUrl = `${process.env.BASE_URL || "https://example.com"}/sign/test`;
      
      const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #ffffff; }
    .wrapper { width: 100%; background-color: #ffffff; padding: 40px 20px; }
    .container { max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .header { background-color: #ffffff; padding: 32px 40px; text-align: center; border-bottom: 1px solid #e9ecef; }
    .content { padding: 40px; }
    .greeting { font-size: 22px; font-weight: 600; margin: 0 0 24px 0; }
    .message { font-size: 16px; color: #4a4a4a; margin: 0 0 16px 0; }
    .button { display: inline-block; background: linear-gradient(135deg, #0066cc 0%, #004499 100%); color: #ffffff; padding: 16px 40px; text-decoration: none; border-radius: 6px; font-weight: 600; }
    .footer { background-color: #f8f9fa; padding: 24px 40px; text-align: center; border-top: 1px solid #e9ecef; }
    .footer-text { font-size: 12px; color: #6c757d; margin: 0 0 8px 0; }
    .footer-legal { font-size: 11px; color: #868e96; margin: 16px 0 0 0; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <div style="background-color: #ffffff; display: inline-block; padding: 8px; border-radius: 4px;">
          ${FAIRSIGN_LOGO_SVG}
        </div>
      </div>
      <div class="content">
        <h1 class="greeting">Hello ${signerName},</h1>
        <p class="message">You have been requested to sign a document. Please review and sign at your earliest convenience.</p>
        <div style="margin: 24px 0; padding: 16px; background: #f8f9fa; border-radius: 6px;">
          <p style="font-size: 13px; color: #6c757d; margin: 0 0 4px 0;">Document</p>
          <p style="font-size: 16px; font-weight: 600; margin: 0;">${documentTitle}</p>
        </div>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${signingUrl}" class="button">Review &amp; Sign Document</a>
        </div>
        <p class="message">If you have any questions about this document, please contact the sender or email <a href="mailto:support@fairsign.io">support@fairsign.io</a>.</p>
      </div>
      <div class="footer">
        <p class="footer-text">This is an automated message from FairSign.io. Please do not reply to this email.</p>
        <p class="footer-legal">&copy; ${currentYear} FairSign.io. All Rights Reserved.<br>Unauthorised use is prohibited by law.</p>
      </div>
    </div>
  </div>
</body>
</html>`.trim();
      
      const result = await sendEmail({
        emailType: "signature_request",
        toEmail,
        toName: signerName,
        subject: `Action Required: ${signerName}, please sign "${documentTitle}"`,
        htmlBody,
      });
      
      res.json({ success: result.success, emailLogId: result.emailLogId, error: result.error });
    } catch (error) {
      console.error("Error sending test email:", error);
      res.status(500).json({ error: "Failed to send test email" });
    }
  });

  // Send signature request email for a document
  app.post("/api/admin/documents/:id/send-email", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.id;
      const documentId = req.params.id;
      const { signerEmail, signerName } = req.body;

      if (!signerEmail) {
        return res.status(400).json({ error: "signerEmail is required" });
      }

      const document = await storage.getDocument(documentId);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }

      // Verify ownership or team membership
      const hasAccess = await canAccessUserDocuments(userId, document.userId);
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (document.status === "completed") {
        return res.status(400).json({ error: "Document already completed" });
      }

      const result = await sendSignatureRequestEmail(document, signerEmail, signerName);

      if (!result.success) {
        return res.status(500).json({ error: result.error || "Failed to send email" });
      }

      await storage.updateDocument(documentId, { status: "sent" });

      await logAuditEvent(documentId, "email_sent", req, {
        emailType: "signature_request",
        recipientEmail: signerEmail,
        emailLogId: result.emailLogId,
      });

      res.json({ 
        success: true, 
        message: "Signature request email sent",
        emailLogId: result.emailLogId 
      });
    } catch (error) {
      console.error("Error sending signature request email:", error);
      res.status(500).json({ error: "Failed to send email" });
    }
  });

  // Send reminder email for a document
  app.post("/api/admin/documents/:id/send-reminder", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.id;
      const documentId = req.params.id;
      const { signerEmail, signerName } = req.body;

      if (!signerEmail) {
        return res.status(400).json({ error: "signerEmail is required" });
      }

      const document = await storage.getDocument(documentId);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }

      // Verify ownership or team membership
      const hasAccess = await canAccessUserDocuments(userId, document.userId);
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (document.status === "completed") {
        return res.status(400).json({ error: "Document already completed" });
      }

      const result = await sendReminderEmail(document, signerEmail, signerName);

      if (!result.success) {
        return res.status(500).json({ error: result.error || "Failed to send reminder" });
      }

      await logAuditEvent(documentId, "reminder_sent", req, {
        emailType: "reminder",
        recipientEmail: signerEmail,
        emailLogId: result.emailLogId,
      });

      res.json({ 
        success: true, 
        message: "Reminder email sent",
        emailLogId: result.emailLogId 
      });
    } catch (error) {
      console.error("Error sending reminder email:", error);
      res.status(500).json({ error: "Failed to send reminder" });
    }
  });

  // Get email logs for a document
  app.get("/api/admin/documents/:id/emails", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.id;
      const documentId = req.params.id;

      const document = await storage.getDocument(documentId);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }

      // Verify ownership or team membership
      const hasAccess = await canAccessUserDocuments(userId, document.userId);
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      const emails = await getEmailLogsForDocument(documentId);

      res.json(emails);
    } catch (error) {
      console.error("Error fetching email logs:", error);
      res.status(500).json({ error: "Failed to fetch email logs" });
    }
  });

  // ========== SIGNER SESSION ROUTES (QR Code Mobile Signing) ==========

  // Create a signer session for mobile signing
  app.post("/api/signer-sessions", async (req: Request, res: Response) => {
    try {
      const { documentId, signerId, spotKey } = req.body;

      if (!documentId || !signerId || !spotKey) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const signer = await storage.getDocumentSignerById(signerId);
      if (!signer) {
        return res.status(404).json({ error: "Signer not found" });
      }

      if (signer.documentId !== documentId) {
        return res.status(403).json({ error: "Signer does not belong to this document" });
      }

      // Generate a unique session token
      const sessionToken = nanoid(32);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      const session = await storage.createSignerSession({
        documentId,
        signerId,
        sessionToken,
        spotKey,
        status: "pending",
        expiresAt,
      });

      res.json({
        sessionToken: session.sessionToken,
        expiresAt: session.expiresAt,
      });
    } catch (error) {
      console.error("Error creating signer session:", error);
      res.status(500).json({ error: "Failed to create signer session" });
    }
  });

  // Verify a signer session (for mobile page)
  app.get("/api/signer-sessions/:sessionToken/verify", async (req: Request, res: Response) => {
    try {
      const { sessionToken } = req.params;

      const session = await storage.getSignerSession(sessionToken);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      if (session.status === "completed") {
        return res.status(400).json({ error: "Session already completed" });
      }

      if (new Date() > session.expiresAt) {
        await storage.updateSignerSession(session.id, { status: "expired" });
        return res.status(400).json({ error: "Session expired" });
      }

      const document = await storage.getDocument(session.documentId);
      const signer = await storage.getDocumentSignerById(session.signerId);

      res.json({
        valid: true,
        documentTitle: (document?.dataJson as any)?.title || "Document",
        signerName: signer?.name || "Signer",
        spotKey: session.spotKey,
      });
    } catch (error) {
      console.error("Error verifying signer session:", error);
      res.status(500).json({ error: "Failed to verify session" });
    }
  });

  // Check session status (for desktop polling)
  app.get("/api/signer-sessions/:sessionToken/status", async (req: Request, res: Response) => {
    try {
      const { sessionToken } = req.params;

      const session = await storage.getSignerSession(sessionToken);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Check if expired
      if (session.status === "pending" && new Date() > session.expiresAt) {
        await storage.updateSignerSession(session.id, { status: "expired" });
        return res.json({ status: "expired" });
      }

      res.json({ status: session.status });
    } catch (error) {
      console.error("Error checking session status:", error);
      res.status(500).json({ error: "Failed to check session status" });
    }
  });

  // Submit signature from mobile device
  app.post("/api/signer-sessions/:sessionToken/submit", upload.single("signature"), async (req: Request, res: Response) => {
    try {
      const { sessionToken } = req.params;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: "No signature file provided" });
      }

      const session = await storage.getSignerSession(sessionToken);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      if (session.status === "completed") {
        return res.status(400).json({ error: "Session already completed" });
      }

      if (new Date() > session.expiresAt) {
        await storage.updateSignerSession(session.id, { status: "expired" });
        return res.status(400).json({ error: "Session expired" });
      }

      const signer = await storage.getDocumentSignerById(session.signerId);
      if (!signer) {
        return res.status(404).json({ error: "Signer not found" });
      }

      // Upload signature to object storage
      const privateDir = objectStorage.getPrivateObjectDir();
      const imageKey = `documents/${session.documentId}/signatures/${session.spotKey}.png`;
      const fullPath = joinStoragePath(privateDir, imageKey);
      await objectStorage.uploadBuffer(file.buffer, fullPath, "image/png");

      // Create signature asset
      await storage.createSignatureAsset({
        documentId: session.documentId,
        spotKey: session.spotKey,
        imageKey,
        signerRole: signer.role,
        signerEmail: signer.email,
      });

      // Mark session as completed
      await storage.updateSignerSession(session.id, {
        status: "completed",
        completedAt: new Date(),
      });

      // Log audit event
      await logAuditEvent(session.documentId, "signature_uploaded", req, {
        spotKey: session.spotKey,
        signerEmail: signer.email,
        signerRole: signer.role,
        source: "mobile_qr",
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error submitting mobile signature:", error);
      res.status(500).json({ error: "Failed to submit signature" });
    }
  });

  return httpServer;
}

// Extract placeholders from HTML template
function extractPlaceholders(htmlContent: string): string[] {
  const regex = /\{\{(\w+)\}\}/g;
  const placeholders: Set<string> = new Set();
  let match;
  while ((match = regex.exec(htmlContent)) !== null) {
    placeholders.add(match[1]);
  }
  return Array.from(placeholders);
}

// Seed signature spots for the lease_v1 template
async function seedSignatureSpots() {
  const templateId = "lease_v1";

  // Check if spots already exist
  const existingSpots = await storage.getSignatureSpots(templateId);
  if (existingSpots.length > 0) {
    console.log("Signature spots already seeded");
    return;
  }

  console.log("Seeding signature spots for lease_v1...");

  // A4 dimensions: 595.28 x 841.89 points
  const spots = [
    {
      templateId,
      spotKey: "tenant_initial_p1",
      page: 1,
      x: 72, // left margin
      y: 680, // near bottom of page 1
      w: 80,
      h: 40,
      kind: "initial",
    },
    {
      templateId,
      spotKey: "tenant_initial_p2",
      page: 2,
      x: 72,
      y: 480,
      w: 80,
      h: 40,
      kind: "initial",
    },
    {
      templateId,
      spotKey: "tenant_signature",
      page: 2,
      x: 72,
      y: 620,
      w: 200,
      h: 60,
      kind: "signature",
    },
  ];

  for (const spot of spots) {
    await storage.createSignatureSpot(spot);
    console.log(`Created spot: ${spot.spotKey}`);
  }

  console.log("Signature spots seeded successfully");
}

// Seed default templates
async function seedDefaultTemplates() {
  const templateId = "lease_v1";
  
  // Check if template already exists
  const existingTemplate = await storage.getTemplate(templateId);
  if (existingTemplate) {
    console.log("Default templates already seeded");
    return;
  }
  
  console.log("Seeding default templates...");
  
  // Read the lease_v1.html template
  const fs = await import("fs");
  const path = await import("path");
  const templatePath = path.join(process.cwd(), "server", "templates", "lease_v1.html");
  const htmlContent = fs.readFileSync(templatePath, "utf-8");
  
  // Extract placeholders
  const placeholders = extractPlaceholders(htmlContent);
  
  // Create the default template (use createTemplateWithId for explicit ID)
  await storage.createTemplateWithId({
    id: templateId,
    name: "Standard Lease Agreement",
    description: "A comprehensive residential lease agreement template with all standard clauses.",
    htmlContent,
    placeholders,
    isDefault: true,
    userId: null,
  });
  
  console.log(`Created default template: ${templateId}`);
  console.log("Default templates seeded successfully");
}
