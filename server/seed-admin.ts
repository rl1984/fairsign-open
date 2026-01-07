import bcrypt from "bcrypt";
import { db } from "./db";
import { users } from "@shared/models/auth";

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL || "rick@twinlite.com";
  const password = process.env.ADMIN_PASSWORD;
  
  if (!password) {
    console.error("Error: ADMIN_PASSWORD environment variable is required");
    process.exit(1);
  }
  
  const passwordHash = await bcrypt.hash(password, 10);

  try {
    await db.insert(users).values({
      email,
      passwordHash,
      firstName: "Admin",
      lastName: "User",
      isAdmin: true,
      emailVerified: true,
    }).onConflictDoNothing();
    
    console.log(`Admin user created: ${email}`);
  } catch (error) {
    console.error("Error creating admin user:", error);
  }
  
  process.exit(0);
}

seedAdmin();
