import session from "express-session";
import express, { type Express, type RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { authenticator } from "otplib";
import { nanoid } from "nanoid";
import passport from "passport";
import { Strategy as GoogleStrategy, Profile as GoogleProfile } from "passport-google-oauth20";
import { OIDCStrategy, IProfile } from "passport-azure-ad";
import { authStorage } from "./storage";
import { sendEmailVerification, sendPasswordResetEmail } from "../../services/emailService";
import { isEnterpriseOrOrg, type User } from "@shared/models/auth";

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
  
  // Add urlencoded parsing for Microsoft OAuth form_post callback
  app.use(express.urlencoded({ extended: true }));

  // Configure passport for Google OAuth
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  
  if (googleClientId && googleClientSecret) {
    // Initialize passport
    app.use(passport.initialize());
    app.use(passport.session());
    
    // Passport serialize/deserialize
    passport.serializeUser((user: any, done) => {
      done(null, user.id);
    });
    
    passport.deserializeUser(async (id: string, done) => {
      try {
        const user = await authStorage.getUser(id);
        done(null, user || null);
      } catch (error) {
        done(error, null);
      }
    });
    
    // Google OAuth strategy
    const callbackURL = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}/auth/google/callback`
      : `${process.env.APP_URL || 'http://localhost:5000'}/auth/google/callback`;
    
    passport.use(new GoogleStrategy({
      clientID: googleClientId,
      clientSecret: googleClientSecret,
      callbackURL,
      scope: ['profile', 'email'],
    }, async (accessToken, refreshToken, profile: GoogleProfile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        const googleId = profile.id;
        const firstName = profile.name?.givenName;
        const lastName = profile.name?.familyName;
        const avatarUrl = profile.photos?.[0]?.value;
        
        if (!email) {
          return done(new Error('no_email'), undefined);
        }
        
        // Check if user exists by Google ID
        let user = await authStorage.getUserByGoogleId(googleId);
        
        if (user) {
          // User already linked to Google - allow login for all tiers
          return done(null, user);
        }
        
        // Check if user exists by email
        user = await authStorage.getUserByEmail(email);
        
        if (user) {
          // Check if user has 2FA enabled - require password login first
          if (user.twoFactorEnabled) {
            return done(new Error('2fa_required'), undefined);
          }
          
          // Check if user is blocked
          if (user.isBlocked) {
            return done(new Error('account_suspended'), undefined);
          }
          
          // Link the Google account (allowed for all tiers)
          const linkedUser = await authStorage.linkGoogleAccount(user.id, googleId, avatarUrl);
          return done(null, linkedUser || user);
        }
        
        // New user signup via Google - create a free tier account
        const newUser = await authStorage.createSSOUser(
          email,
          googleId,
          firstName,
          lastName,
          avatarUrl
        );
        return done(null, newUser);
      } catch (error) {
        return done(error as Error, undefined);
      }
    }));
    
    // Google OAuth routes
    app.get('/auth/google', (req, res, next) => {
      // Store the state parameter for CSRF protection
      const state = nanoid(32);
      (req.session as any).oauthState = state;
      
      passport.authenticate('google', {
        scope: ['profile', 'email'],
        state,
        prompt: 'select_account',
      })(req, res, next);
    });
    
    app.get('/auth/google/callback', (req, res, next) => {
      // Verify state parameter
      const state = req.query.state as string;
      const sessionState = (req.session as any).oauthState;
      
      if (!state || state !== sessionState) {
        return res.redirect('/?error=invalid_state');
      }
      
      // Clear the state
      delete (req.session as any).oauthState;
      
      passport.authenticate('google', { session: false }, async (err: Error | null, user: User | false) => {
        if (err) {
          console.error('Google OAuth error:', err.message);
          return res.redirect(`/?error=${encodeURIComponent(err.message)}`);
        }
        
        if (!user) {
          return res.redirect('/?error=authentication_failed');
        }
        
        // Check if user is blocked
        if (user.isBlocked) {
          return res.redirect('/?error=account_suspended');
        }
        
        // Set session
        req.session.userId = user.id;
        
        // Redirect to dashboard
        res.redirect('/dashboard');
      })(req, res, next);
    });
    
    console.log('[Auth] Google OAuth configured');
  } else {
    console.log('[Auth] Google OAuth not configured (missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET)');
  }

  // Configure Microsoft/Azure AD OAuth (Enterprise/Org only)
  const microsoftClientId = process.env.MICROSOFT_CLIENT_ID;
  const microsoftClientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const microsoftTenantId = process.env.MICROSOFT_TENANT_ID || 'common'; // 'common' allows any Azure AD tenant
  
  if (microsoftClientId && microsoftClientSecret) {
    // Ensure passport is initialized (might not be if Google OAuth is not configured)
    if (!googleClientId || !googleClientSecret) {
      app.use(passport.initialize());
      app.use(passport.session());
      
      passport.serializeUser((user: any, done) => {
        done(null, user.id);
      });
      
      passport.deserializeUser(async (id: string, done) => {
        try {
          const user = await authStorage.getUser(id);
          done(null, user || null);
        } catch (error) {
          done(error, null);
        }
      });
    }
    
    const microsoftCallbackURL = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}/auth/microsoft/callback`
      : `${process.env.APP_URL || 'http://localhost:5000'}/auth/microsoft/callback`;
    
    // Microsoft OIDC Strategy
    passport.use('azuread-openidconnect', new OIDCStrategy({
      identityMetadata: `https://login.microsoftonline.com/${microsoftTenantId}/v2.0/.well-known/openid-configuration`,
      clientID: microsoftClientId,
      clientSecret: microsoftClientSecret,
      responseType: 'code',
      responseMode: 'form_post',
      redirectUrl: microsoftCallbackURL,
      allowHttpForRedirectUrl: process.env.NODE_ENV !== 'production',
      validateIssuer: false, // Allow any Azure AD tenant
      passReqToCallback: false,
      scope: ['openid', 'profile', 'email'],
      loggingLevel: 'error',
    }, async (iss: string, sub: string, profile: IProfile, accessToken: string, refreshToken: string, done: any) => {
      try {
        // Debug logging for Microsoft SSO
        console.log('[Microsoft SSO] Profile received:', JSON.stringify({
          oid: profile.oid,
          upn: profile.upn,
          displayName: profile.displayName,
          name: profile.name,
          _json: profile._json,
        }, null, 2));
        
        const email = profile._json?.email || profile.upn || profile._json?.preferred_username;
        const microsoftId = profile.oid;
        const firstName = profile._json?.given_name || profile.name?.givenName;
        const lastName = profile._json?.family_name || profile.name?.familyName;
        const avatarUrl = undefined; // Microsoft doesn't provide avatar in basic profile
        
        console.log('[Microsoft SSO] Extracted data:', { email, microsoftId, firstName, lastName });
        
        if (!email) {
          console.log('[Microsoft SSO] Error: No email found in profile');
          return done(null, false, { message: 'No email address found in Microsoft profile' });
        }
        
        if (!microsoftId) {
          console.log('[Microsoft SSO] Error: No Microsoft ID (oid) found in profile');
          return done(null, false, { message: 'No Microsoft ID found in profile' });
        }
        
        // Check if user exists by Microsoft ID
        let user = await authStorage.getUserByMicrosoftId(microsoftId);
        console.log('[Microsoft SSO] User by Microsoft ID:', user ? { id: user.id, email: user.email, accountType: user.accountType } : null);
        
        if (user) {
          // User already linked to Microsoft - verify they still have Enterprise/Org tier
          if (!isEnterpriseOrOrg(user.accountType)) {
            console.log('[Microsoft SSO] Error: User exists but accountType is not Enterprise/Org:', user.accountType);
            return done(null, false, { message: `Enterprise plan required. Current plan: ${user.accountType}` });
          }
          console.log('[Microsoft SSO] Success: Existing linked user authenticated');
          return done(null, user);
        }
        
        // Check if user exists by email
        user = await authStorage.getUserByEmail(email);
        console.log('[Microsoft SSO] User by email:', user ? { id: user.id, email: user.email, accountType: user.accountType } : null);
        
        if (user) {
          // Existing user - enforce Enterprise/Org tier requirement
          if (!isEnterpriseOrOrg(user.accountType)) {
            console.log('[Microsoft SSO] Error: User found by email but accountType is not Enterprise/Org:', user.accountType);
            return done(null, false, { message: `Enterprise plan required to link Microsoft SSO. Current plan: ${user.accountType}` });
          }
          
          // Check if user has 2FA enabled - require password login first
          if (user.twoFactorEnabled) {
            console.log('[Microsoft SSO] Error: User has 2FA enabled, must login with password first');
            return done(null, false, { message: '2FA enabled - please login with password first to link Microsoft account' });
          }
          
          // Check if user is blocked
          if (user.isBlocked) {
            console.log('[Microsoft SSO] Error: User account is blocked');
            return done(null, false, { message: 'Account suspended' });
          }
          
          // Link the Microsoft account
          console.log('[Microsoft SSO] Linking Microsoft account to existing user:', user.id);
          const linkedUser = await authStorage.linkMicrosoftAccount(user.id, microsoftId, avatarUrl);
          console.log('[Microsoft SSO] Success: Microsoft account linked');
          return done(null, linkedUser || user);
        }
        
        // New user signup via Microsoft SSO is not allowed - must use email signup first
        // then upgrade to Enterprise/Org before enabling SSO
        console.log('[Microsoft SSO] Error: No existing user found for email:', email);
        return done(null, false, { message: 'No account found. Please sign up with email first, then upgrade to Enterprise to enable Microsoft SSO' });
      } catch (error) {
        console.error('[Microsoft SSO] Exception in verify callback:', error);
        return done(error as Error, undefined);
      }
    }));
    
    // Microsoft OAuth routes
    app.get('/auth/microsoft', (req, res, next) => {
      console.log('[Microsoft SSO] Starting OAuth flow, session ID:', req.sessionID);
      // Let passport-azure-ad handle state generation and validation internally
      passport.authenticate('azuread-openidconnect', {
        prompt: 'select_account',
      } as any)(req, res, next);
    });
    
    // Microsoft uses form_post for the callback
    // Note: passport-azure-ad handles state validation internally via OIDC protocol
    app.post('/auth/microsoft/callback', (req, res, next) => {
      console.log('[Microsoft SSO Callback] Received callback, session ID:', req.sessionID);
      
      passport.authenticate('azuread-openidconnect', { session: false }, async (err: Error | null, user: User | false, info?: { message?: string }) => {
        console.log('[Microsoft SSO Callback] Auth result - err:', err?.message, 'user:', user ? 'present' : 'false', 'info:', info);
        
        if (err) {
          console.error('[Microsoft SSO Callback] Error:', err.message);
          return res.redirect(`/?error=${encodeURIComponent(err.message)}`);
        }
        
        if (!user) {
          const errorMessage = info?.message || 'authentication_failed';
          console.log('[Microsoft SSO Callback] Authentication failed:', errorMessage);
          return res.redirect(`/?error=${encodeURIComponent(errorMessage)}`);
        }
        
        // Check if user is blocked
        if (user.isBlocked) {
          console.log('[Microsoft SSO Callback] User is blocked');
          return res.redirect('/?error=account_suspended');
        }
        
        console.log('[Microsoft SSO Callback] Success! Setting session for user:', user.id);
        // Set session
        req.session.userId = user.id;
        
        // Redirect to dashboard
        res.redirect('/dashboard');
      })(req, res, next);
    });
    
    console.log('[Auth] Microsoft/Azure AD OAuth configured');
  } else {
    console.log('[Auth] Microsoft OAuth not configured (missing MICROSOFT_CLIENT_ID or MICROSOFT_CLIENT_SECRET)');
  }

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

      if (user.isBlocked) {
        return res.status(403).json({ 
          message: "Your account has been suspended. Please contact support.",
          isBlocked: true
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

      if (user.isBlocked) {
        return res.status(403).json({ 
          message: "Your account has been suspended. Please contact support.",
          isBlocked: true
        });
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

  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      const user = await authStorage.getUserByEmail(email);

      if (!user) {
        return res.json({ message: "If an account exists with that email, a password reset link has been sent." });
      }

      if (!user.passwordHash) {
        return res.json({ message: "If an account exists with that email, a password reset link has been sent." });
      }

      const resetToken = nanoid(32);
      const tokenExpiry = new Date(Date.now() + 60 * 60 * 1000);

      await authStorage.setPasswordResetToken(user.id, resetToken, tokenExpiry);
      await sendPasswordResetEmail(email, resetToken);

      res.json({ message: "If an account exists with that email, a password reset link has been sent." });
    } catch (error) {
      console.error("Forgot password error:", error);
      res.status(500).json({ message: "Failed to process password reset request" });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        return res.status(400).json({ message: "Token and new password are required" });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }

      const user = await authStorage.getUserByPasswordResetToken(token);

      if (!user) {
        return res.status(400).json({ message: "Invalid or expired reset token" });
      }

      if (user.passwordResetExpiry && new Date() > user.passwordResetExpiry) {
        return res.status(400).json({ message: "Reset token has expired. Please request a new one." });
      }

      await authStorage.updatePassword(user.id, newPassword);
      await authStorage.clearPasswordResetToken(user.id);

      res.json({ message: "Password has been reset successfully. You can now log in with your new password." });
    } catch (error) {
      console.error("Reset password error:", error);
      res.status(500).json({ message: "Failed to reset password" });
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
