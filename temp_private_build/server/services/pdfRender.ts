import puppeteer from "puppeteer";
import * as fs from "fs";
import * as path from "path";
import { PDFDocument, rgb } from "pdf-lib";
import { storage } from "../storage";
import { getStorageBackend } from "./storageBackend";
import type { TemplateField } from "@shared/schema";

const TEMPLATE_DIR = path.join(process.cwd(), "server", "templates");

async function getTemplateHtml(templateId: string): Promise<string> {
  // Check if this is a UUID (database template) or a file-based template
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(templateId);
  
  if (isUUID) {
    // Try to load from database
    const template = await storage.getTemplate(templateId);
    if (template && template.htmlContent) {
      return template.htmlContent;
    }
  }
  
  // Fall back to file-based template
  const templatePath = path.join(TEMPLATE_DIR, `${templateId}.html`);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templateId}`);
  }
  
  return fs.readFileSync(templatePath, "utf-8");
}

export async function renderHtmlToPdf(
  templateId: string,
  data: Record<string, unknown>
): Promise<Buffer> {
  let html = await getTemplateHtml(templateId);

  // Replace placeholders like {{key}} with data values
  for (const [key, value] of Object.entries(data)) {
    const placeholder = new RegExp(`{{${key}}}`, "g");
    html = html.replace(placeholder, String(value ?? ""));
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "18mm",
        right: "15mm",
        bottom: "18mm",
        left: "15mm",
      },
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16) / 255,
        g: parseInt(result[2], 16) / 255,
        b: parseInt(result[3], 16) / 255,
      }
    : { r: 0, g: 0, b: 0 };
}

export async function renderPdfTemplate(
  templateId: string,
  data: Record<string, string | Buffer>,
  signatureData?: Record<string, Buffer>
): Promise<Buffer> {
  const template = await storage.getTemplate(templateId);
  if (!template) {
    throw new Error(`Template not found: ${templateId}`);
  }

  if (template.templateType !== "pdf" || !template.pdfStorageKey) {
    throw new Error(`Template ${templateId} is not a PDF template`);
  }

  const objectStorage = getStorageBackend();
  const pdfBuffer = await objectStorage.downloadBuffer(template.pdfStorageKey);
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();

  const fields = await storage.getTemplateFields(templateId);

  for (const field of fields) {
    const pageIndex = field.page - 1;
    if (pageIndex < 0 || pageIndex >= pages.length) {
      console.warn(`Invalid page number for field ${field.apiTag}: ${field.page}`);
      continue;
    }

    const page = pages[pageIndex];
    const pageHeight = page.getHeight();

    const x = Number(field.x);
    const y = pageHeight - Number(field.y) - Number(field.height);
    const width = Number(field.width);
    const height = Number(field.height);

    if (field.fieldType === "text") {
      const value = data[field.apiTag];
      if (typeof value === "string" && value) {
        const fontSize = field.fontSize || 12;
        const fontColor = field.fontColor || "#000000";
        const { r, g, b } = hexToRgb(fontColor);

        page.drawText(value, {
          x,
          y: y + height - fontSize,
          size: fontSize,
          color: rgb(r, g, b),
          maxWidth: width,
        });
      }
    } else if (field.fieldType === "signature") {
      const sigBuffer = signatureData?.[field.apiTag] || (data[field.apiTag] instanceof Buffer ? data[field.apiTag] as Buffer : null);
      if (sigBuffer) {
        try {
          const pngImage = await pdfDoc.embedPng(sigBuffer);
          page.drawImage(pngImage, {
            x,
            y,
            width,
            height,
          });
        } catch (error) {
          console.error(`Failed to embed signature for field ${field.apiTag}:`, error);
        }
      }
    } else if (field.fieldType === "checkbox") {
      const value = data[field.apiTag];
      if (value === "true" || value === "1" || value === "yes" || value === "checked") {
        const checkSize = Math.min(width, height) * 0.8;
        const checkX = x + (width - checkSize) / 2;
        const checkY = y + (height - checkSize) / 2;

        page.drawText("X", {
          x: checkX,
          y: checkY,
          size: checkSize,
          color: rgb(0, 0, 0),
        });
      }
    }
  }

  const filledPdfBytes = await pdfDoc.save();
  return Buffer.from(filledPdfBytes);
}

export async function renderDocumentFromTemplate(
  templateId: string,
  data: Record<string, string>
): Promise<Buffer> {
  const template = await storage.getTemplate(templateId);
  if (!template) {
    throw new Error(`Template not found: ${templateId}`);
  }

  if (template.templateType === "pdf") {
    return renderPdfTemplate(templateId, data);
  } else {
    return renderHtmlToPdf(templateId, data);
  }
}
