import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont } from "pdf-lib";
import type { AuditEvent } from "@shared/schema";
import fs from "fs";
import path from "path";

// Load the logo image for audit trail
let logoImageBuffer: Buffer | null = null;
try {
  const logoPath = path.join(process.cwd(), "server/assets/logo.png");
  if (fs.existsSync(logoPath)) {
    logoImageBuffer = fs.readFileSync(logoPath);
  }
} catch (err) {
  console.warn("Could not load logo for audit trail:", err);
}

interface SignatureImage {
  spotKey: string;
  imageBuffer: Buffer;
  signedAt?: Date;
}

interface TextFieldValue {
  spotKey: string;
  value: string;
  fieldType: string; // text | date | checkbox
}

interface SpotPosition {
  spotKey: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  kind?: string; // signature | initial | text | date | checkbox
}

interface AuditTrailOptions {
  documentId: string;
  documentTitle?: string;
  sha256?: string;
  originalHash?: string; // SHA-256 hash of the original blank PDF before any modifications
  senderVerified?: boolean; // Whether the document sender has verified identity
  senderName?: string; // Name of the document creator/sender
  senderEmail?: string; // Email of the document creator/sender
}

function formatSignedDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export async function stampSignaturesIntoPdf(
  pdfBuffer: Buffer,
  spots: SpotPosition[],
  signatures: SignatureImage[],
  textFields?: TextFieldValue[]
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(new Uint8Array(pdfBuffer));
  const pages = pdfDoc.getPages();
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Stamp signature images
  for (const signature of signatures) {
    const spot = spots.find((s) => s.spotKey === signature.spotKey);
    if (!spot) {
      console.warn(`No spot found for signature: ${signature.spotKey}`);
      continue;
    }

    const pageIndex = spot.page - 1;
    if (pageIndex < 0 || pageIndex >= pages.length) {
      console.warn(`Invalid page number for spot ${spot.spotKey}: ${spot.page}`);
      continue;
    }

    const page = pages[pageIndex];
    const pageHeight = page.getHeight();

    try {
      const pngImage = await pdfDoc.embedPng(new Uint8Array(signature.imageBuffer));

      const x = spot.x;
      const y = pageHeight - spot.y - spot.h;

      page.drawImage(pngImage, {
        x,
        y,
        width: spot.w,
        height: spot.h,
      });

      const signedDate = signature.signedAt || new Date();
      const dateText = `Signed: ${formatSignedDate(signedDate)}`;
      const fontSize = 8;
      const minY = 10;
      let dateY = y - fontSize - 2;
      
      if (dateY < minY) {
        dateY = y + spot.h + 2;
      }
      
      if (dateY > 0 && dateY < pageHeight) {
        page.drawText(dateText, {
          x: x,
          y: dateY,
          size: fontSize,
          font: helveticaFont,
          color: rgb(0.3, 0.3, 0.3),
        });
      }

      console.log(`Stamped signature ${signature.spotKey} on page ${spot.page} at (${x}, ${y}) with date`);
    } catch (error) {
      console.error(`Failed to stamp signature ${signature.spotKey}:`, error);
      throw error;
    }
  }

  // Stamp text field values
  if (textFields && textFields.length > 0) {
    for (const textField of textFields) {
      const spot = spots.find((s) => s.spotKey === textField.spotKey);
      if (!spot) {
        console.warn(`No spot found for text field: ${textField.spotKey}`);
        continue;
      }

      const pageIndex = spot.page - 1;
      if (pageIndex < 0 || pageIndex >= pages.length) {
        console.warn(`Invalid page number for text field ${textField.spotKey}: ${spot.page}`);
        continue;
      }

      const page = pages[pageIndex];
      const pageHeight = page.getHeight();

      try {
        const x = spot.x + 4; // Small padding from left edge
        const y = pageHeight - spot.y - spot.h + 4; // Position text inside the box

        if (textField.fieldType === "checkbox") {
          // Draw a checkmark for checked checkboxes (handle "true", "on", "1")
          const isChecked = textField.value === "true" || textField.value === "on" || textField.value === "1";
          if (isChecked) {
            const centerX = spot.x + spot.w / 2;
            const centerY = pageHeight - spot.y - spot.h / 2;
            const size = Math.min(spot.w, spot.h) * 0.6;
            
            page.drawText("X", {
              x: centerX - size / 3,
              y: centerY - size / 3,
              size: size,
              font: helveticaFont,
              color: rgb(0, 0.2, 0.6),
            });
          }
          console.log(`Stamped checkbox ${textField.spotKey} on page ${spot.page} (${isChecked ? "checked" : "unchecked"})`);
        } else {
          // Draw text for text/date fields with truncation to fit within spot width
          const fontSize = Math.min(12, spot.h * 0.6);
          let displayValue = textField.value;
          const maxWidth = spot.w - 8; // Leave padding on both sides
          
          // Truncate text if it exceeds the spot width
          let textWidth = helveticaFont.widthOfTextAtSize(displayValue, fontSize);
          while (textWidth > maxWidth && displayValue.length > 3) {
            displayValue = displayValue.slice(0, -1);
            textWidth = helveticaFont.widthOfTextAtSize(displayValue + "...", fontSize);
          }
          if (displayValue !== textField.value && displayValue.length > 0) {
            displayValue = displayValue + "...";
          }
          
          page.drawText(displayValue, {
            x,
            y,
            size: fontSize,
            font: helveticaFont,
            color: rgb(0, 0, 0),
          });
          console.log(`Stamped text field ${textField.spotKey} on page ${spot.page}: "${displayValue}"`);
        }
      } catch (error) {
        console.error(`Failed to stamp text field ${textField.spotKey}:`, error);
        throw error;
      }
    }
  }

  const signedPdfBytes = await pdfDoc.save();
  return Buffer.from(signedPdfBytes);
}

function formatEventName(event: string): string {
  const eventLabels: Record<string, string> = {
    document_created: "Document Created",
    document_viewed: "Document Viewed",
    signature_uploaded: "Signature Captured",
    consent_given: "Consent Given",
    signer_completed: "Signer Completed",
    completed: "Document Completed",
    webhook_sent: "Webhook Sent",
    signer_webhook_sent: "Signer Webhook Sent",
    completion_email_sent: "Completion Email Sent",
    signing_email_sent: "Signing Email Sent",
  };
  return eventLabels[event] || event.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function formatAuditDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
}

function wrapText(text: string, maxWidth: number, font: PDFFont, fontSize: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);
    
    if (testWidth > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines;
}

export async function appendAuditTrailPage(
  pdfBuffer: Buffer,
  auditEvents: AuditEvent[],
  options: AuditTrailOptions
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(new Uint8Array(pdfBuffer));
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  const pageWidth = 612; // Letter size
  const pageHeight = 792;
  const margin = 50;
  const contentWidth = pageWidth - (margin * 2);
  
  let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
  let yPosition = pageHeight - margin;
  
  const lineHeight = 14;
  const sectionGap = 20;
  
  function addNewPageIfNeeded(requiredSpace: number): void {
    if (yPosition - requiredSpace < margin) {
      currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
      yPosition = pageHeight - margin;
    }
  }
  
  function drawText(text: string, x: number, fontSize: number, font: PDFFont, color = rgb(0, 0, 0)): void {
    currentPage.drawText(text, { x, y: yPosition, size: fontSize, font, color });
  }
  
  // Logo and Title header
  const logoSize = 40;
  if (logoImageBuffer) {
    try {
      const logoImage = await pdfDoc.embedPng(logoImageBuffer);
      currentPage.drawImage(logoImage, {
        x: margin,
        y: yPosition - logoSize + 10,
        width: logoSize,
        height: logoSize,
      });
      // Title next to logo
      currentPage.drawText("AUDIT TRAIL", { 
        x: margin + logoSize + 10, 
        y: yPosition - 10, 
        size: 18, 
        font: helveticaBold 
      });
      currentPage.drawText("FairSign.io", { 
        x: margin + logoSize + 10, 
        y: yPosition - 26, 
        size: 10, 
        font: helveticaFont,
        color: rgb(0.4, 0.4, 0.4)
      });
      yPosition -= logoSize + 10;
    } catch (err) {
      // Fallback to text-only title
      drawText("AUDIT TRAIL", margin, 18, helveticaBold);
      yPosition -= 30;
    }
  } else {
    // Fallback to text-only title
    drawText("AUDIT TRAIL", margin, 18, helveticaBold);
    yPosition -= 30;
  }
  
  // Document info section
  drawText("Document Information", margin, 12, helveticaBold);
  yPosition -= lineHeight + 5;
  
  drawText(`Document ID: ${options.documentId}`, margin, 10, helveticaFont, rgb(0.3, 0.3, 0.3));
  yPosition -= lineHeight;
  
  if (options.documentTitle) {
    drawText(`Title: ${options.documentTitle}`, margin, 10, helveticaFont, rgb(0.3, 0.3, 0.3));
    yPosition -= lineHeight;
  }
  
  // Show sender/creator info
  if (options.senderEmail) {
    const senderDisplay = options.senderName 
      ? `${options.senderName} (${options.senderEmail})`
      : options.senderEmail;
    drawText(`Sent by: ${senderDisplay}`, margin, 10, helveticaFont, rgb(0.3, 0.3, 0.3));
    yPosition -= lineHeight;
  }
  
  drawText(`Generated: ${formatAuditDate(new Date())}`, margin, 10, helveticaFont, rgb(0.3, 0.3, 0.3));
  yPosition -= lineHeight;
  
  // Show verified sender status
  if (options.senderVerified) {
    yPosition -= 3;
    // Draw verified sender indicator (using ASCII-compatible text for PDF standard fonts)
    currentPage.drawText("[OK]", { 
      x: margin, 
      y: yPosition, 
      size: 10, 
      font: helveticaBold, 
      color: rgb(0.3, 0.65, 0.35) // Green color
    });
    currentPage.drawText("Sender Identity Verified", { 
      x: margin + 28, 
      y: yPosition, 
      size: 10, 
      font: helveticaBold, 
      color: rgb(0.3, 0.65, 0.35)
    });
    yPosition -= lineHeight;
  }
  
  // Show original document hash for third-party verification
  if (options.originalHash) {
    yPosition -= 5;
    drawText(`Original Document Hash (Pre-Signing):`, margin, 10, helveticaFont, rgb(0.3, 0.3, 0.3));
    yPosition -= lineHeight;
    drawText(options.originalHash, margin, 8, helveticaFont, rgb(0.4, 0.4, 0.4));
    yPosition -= lineHeight - 2;
    drawText(`Matches the SHA-256 hash of the original blank file.`, margin, 7, helveticaFont, rgb(0.5, 0.5, 0.5));
    yPosition -= lineHeight;
  } else if (options.sha256) {
    // Fallback for legacy documents without original hash
    yPosition -= 5;
    drawText(`Content Hash (Signed Version):`, margin, 10, helveticaFont, rgb(0.3, 0.3, 0.3));
    yPosition -= lineHeight;
    drawText(options.sha256, margin, 8, helveticaFont, rgb(0.4, 0.4, 0.4));
    yPosition -= lineHeight;
  }
  
  yPosition -= sectionGap;
  
  // Audit events section
  drawText("Signing Activity", margin, 12, helveticaBold);
  yPosition -= lineHeight + 10;
  
  // Sort events chronologically
  const sortedEvents = [...auditEvents].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  
  for (const event of sortedEvents) {
    addNewPageIfNeeded(80);
    
    // Draw separator line
    currentPage.drawLine({
      start: { x: margin, y: yPosition + 5 },
      end: { x: pageWidth - margin, y: yPosition + 5 },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.85),
    });
    yPosition -= 10;
    
    // Event name and timestamp
    const eventName = formatEventName(event.event);
    const timestamp = formatAuditDate(event.createdAt);
    
    drawText(eventName, margin, 10, helveticaBold);
    
    const timestampWidth = helveticaFont.widthOfTextAtSize(timestamp, 9);
    currentPage.drawText(timestamp, {
      x: pageWidth - margin - timestampWidth,
      y: yPosition,
      size: 9,
      font: helveticaFont,
      color: rgb(0.5, 0.5, 0.5),
    });
    yPosition -= lineHeight;
    
    // IP address
    if (event.ip) {
      drawText(`IP: ${event.ip}`, margin + 10, 9, helveticaFont, rgb(0.4, 0.4, 0.4));
      yPosition -= lineHeight - 2;
    }
    
    // Metadata details
    if (event.metaJson && typeof event.metaJson === "object") {
      const meta = event.metaJson as Record<string, unknown>;
      
      // Signer info (show name and email)
      if (meta.signerEmail) {
        const signerDisplay = meta.signerName 
          ? `${meta.signerName} (${meta.signerEmail})`
          : String(meta.signerEmail);
        drawText(`Signer: ${signerDisplay}`, margin + 10, 9, helveticaFont, rgb(0.4, 0.4, 0.4));
        yPosition -= lineHeight - 2;
      }
      
      // Spot key for signature events
      if (meta.spotKey) {
        drawText(`Field: ${meta.spotKey}`, margin + 10, 9, helveticaFont, rgb(0.4, 0.4, 0.4));
        yPosition -= lineHeight - 2;
      }
      
      // SHA-256 for completion
      if (meta.sha256 && event.event === "completed") {
        drawText(`Hash: ${meta.sha256}`, margin + 10, 8, helveticaFont, rgb(0.4, 0.4, 0.4));
        yPosition -= lineHeight - 2;
      }
    }
    
    yPosition -= 8;
  }
  
  // Footer with verification note
  addNewPageIfNeeded(50);
  yPosition -= sectionGap;
  
  currentPage.drawLine({
    start: { x: margin, y: yPosition + 5 },
    end: { x: pageWidth - margin, y: yPosition + 5 },
    thickness: 1,
    color: rgb(0.7, 0.7, 0.7),
  });
  yPosition -= 15;
  
  const footerText = "This audit trail is automatically generated and cryptographically linked to the signed document.";
  const wrappedFooter = wrapText(footerText, contentWidth, helveticaFont, 8);
  for (const line of wrappedFooter) {
    drawText(line, margin, 8, helveticaFont, rgb(0.5, 0.5, 0.5));
    yPosition -= 10;
  }
  
  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
