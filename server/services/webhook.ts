import { createHmac } from "crypto";

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "default_webhook_secret";

// Flexible payload type to support both standard and BoldSign-compatible formats
export type WebhookPayloadCompat = Record<string, unknown>;

export function generateHmacSignature(payload: string): string {
  const hmac = createHmac("sha256", WEBHOOK_SECRET);
  hmac.update(payload);
  return `sha256=${hmac.digest("hex")}`;
}

export async function sendWebhook(
  callbackUrl: string,
  payload: WebhookPayloadCompat
): Promise<boolean> {
  const payloadString = JSON.stringify(payload);
  const signature = generateHmacSignature(payloadString);

  try {
    console.log(`Sending webhook to ${callbackUrl}`);
    console.log(`Payload:`, payload);

    const response = await fetch(callbackUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Signature-256": signature,
      },
      body: payloadString,
    });

    if (!response.ok) {
      console.warn(
        `Webhook failed with status ${response.status}: ${await response.text()}`
      );
      return false;
    }

    console.log(`Webhook sent successfully to ${callbackUrl}`);
    return true;
  } catch (error) {
    console.error(`Failed to send webhook to ${callbackUrl}:`, error);
    return false;
  }
}
