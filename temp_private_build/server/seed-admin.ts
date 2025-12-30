import bcrypt from "bcrypt";
import { db } from "./db";
import { users } from "@shared/models/auth";

async function seedAdmin() {
  const email = "rick@twinlite.com";
  const password = "password123";
  const passwordHash = await bcrypt.hash(password, 10);

  try {
    await db.insert(users).values({
      email,
      passwordHash,
      firstName: "Rick",
      lastName: "Admin",
      isAdmin: true,
    }).onConflictDoNothing();
    
    console.log(`Admin user created: ${email}`);
  } catch (error) {
    console.error("Error creating admin user:", error);
  }
  
  process.exit(0);
}

seedAdmin();
