import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { authenticator } from "otplib";
import { nanoid } from "nanoid";
import { authStorage } from "./storage";
import { sendEmailVerification } from "../../services/emailService";

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: sessionTtl,
    },
  });
}

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());

  app.post("/api/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      const user = await authStorage.validatePassword(email, password);
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      if (!user.emailVerified) {
        return res.status(403).json({ 
          message: "Please verify your email before logging in",
          requiresVerification: true,
          email: user.email
        });
      }

      if (user.twoFactorEnabled && user.twoFactorSecret) {
        return res.status(200).json({ 
          requires2FA: true,
          message: "Two-factor authentication required" 
        });
      }

      req.session.userId = user.id;
      res.json({ 
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isAdmin: user.isAdmin,
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/login/2fa", async (req, res) => {
    try {
      const { email, password, totpCode } = req.body;
      
      if (!email || !password || !totpCode) {
        return res.status(400).json({ message: "Email, password, and code are required" });
      }

      const user = await authStorage.validatePassword(email, password);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      if (!user.twoFactorEnabled || !user.twoFactorSecret) {
        return res.status(400).json({ message: "2FA not enabled for this user" });
      }

      const isValid = authenticator.verify({ token: totpCode, secret: user.twoFactorSecret });
      if (!isValid) {
        return res.status(401).json({ message: "Invalid verification code" });
      }

      req.session.userId = user.id;
      res.json({ 
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isAdmin: user.isAdmin,
      });
    } catch (error) {
      console.error("2FA login error:", error);
      res.status(500).json({ message: "Verification failed" });
    }
  });

  app.post("/api/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.json({ message: "Logged out" });
    });
  });

  app.post("/api/auth/register", async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      if (password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }

      const existingUser = await authStorage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "An account with this email already exists" });
      }

      const verificationToken = nanoid(32);
      const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const user = await authStorage.createUnverifiedUser(
        email,
        password,
        verificationToken,
        tokenExpiry
      );

      try {
        await sendEmailVerification(email, verificationToken);
      } catch (emailError) {
        console.error("Failed to send verification email:", emailError);
      }

      res.status(201).json({
        message: "Account created. Please check your email to verify your account. If you don't receive an email, you can request a new verification link.",
        requiresVerification: true,
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.get("/api/auth/verify-email", async (req, res) => {
    try {
      const { token } = req.query;

      if (!token || typeof token !== "string") {
        return res.status(400).json({ message: "Invalid verification token" });
      }

      const user = await authStorage.getUserByVerificationToken(token);

      if (!user) {
        return res.status(400).json({ message: "Invalid or expired verification token" });
      }

      if (user.emailVerificationExpiry && new Date() > user.emailVerificationExpiry) {
        return res.status(400).json({ message: "Verification token has expired. Please request a new one." });
      }

      await authStorage.verifyEmail(user.id);

      res.json({ message: "Email verified successfully. You can now log in." });
    } catch (error) {
      console.error("Email verification error:", error);
      res.status(500).json({ message: "Verification failed" });
    }
  });

  app.post("/api/auth/resend-verification", async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      const user = await authStorage.getUserByEmail(email);

      if (!user) {
        return res.json({ message: "If an account exists, a verification email has been sent." });
      }

      if (user.emailVerified) {
        return res.json({ message: "Email is already verified. You can log in." });
      }

      const verificationToken = nanoid(32);
      const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await authStorage.setVerificationToken(user.id, verificationToken, tokenExpiry);
      await sendEmailVerification(email, verificationToken);

      res.json({ message: "If an account exists, a verification email has been sent." });
    } catch (error) {
      console.error("Resend verification error:", error);
      res.status(500).json({ message: "Failed to send verification email" });
    }
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const user = await authStorage.getUser(req.session.userId);
  if (!user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  (req as any).user = user;
  next();
};
