import { db } from "../server/db";
import { sql } from "drizzle-orm";
import { randomBytes } from "crypto";

// The document ID we are working with
const DOC_ID = "2ad33c76-160a-4a40-92f9-87628bdeb9b1";
const PUBLIC_DOMAIN = "2c3bf9d5-7c9b-4706-a630-ddc36b8bb517-00-3bhs92si2jb1.spock.replit.dev";

async function main() {
  console.log(`🎫 Generating fresh signing link for ${DOC_ID}...`);

  // 1. Create a secure random token
  const newToken = randomBytes(24).toString('hex');

  try {
    // 2. Sync token to both the column and the JSON blob for compatibility
    await db.execute(sql`
      UPDATE documents 
      SET 
        signing_token = ${newToken},
        data_json = jsonb_set(COALESCE(data_json, '{}'::jsonb), '{token}', to_jsonb(${newToken}::text))
      WHERE id = ${DOC_ID}
    `);

    console.log("\n✅ SUCCESS! Copy and paste this URL into your browser:");
    console.log("---------------------------------------------------------");
    console.log(`https://${PUBLIC_DOMAIN}/d/${DOC_ID}?token=${newToken}`);
    console.log("---------------------------------------------------------");
  } catch (err: any) {
    console.error("❌ Error updating token:", err.message);
  }

  process.exit(0);
}

main().catch(console.error);