import type { Request, Response, NextFunction } from "express";
import type { IAuthStorage } from "../replit_integrations/auth/storage";
import crypto from "crypto";
import { isEnterprise } from "@shared/models/auth";

const API_KEY_PREFIX = "fs_live_";

export function createBearerAuthMiddleware(authStorage: IAuthStorage) {
  return async function bearerAuth(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next();
    }
    
    const token = authHeader.slice(7);
    
    if (!token.startsWith(API_KEY_PREFIX)) {
      return res.status(401).json({ error: "Invalid API key format" });
    }
    
    try {
      const keyPrefix = token.substring(0, 16);
      
      const apiKey = await authStorage.getApiKeyByPrefix(keyPrefix);
      if (!apiKey) {
        return res.status(401).json({ error: "Invalid API key" });
      }
      
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      if (tokenHash !== apiKey.keyHash) {
        return res.status(401).json({ error: "Invalid API key" });
      }
      
      const organization = await authStorage.getOrganization(apiKey.organizationId);
      if (!organization) {
        console.warn(`[BearerAuth] API key ${apiKey.id} references deleted organization ${apiKey.organizationId}`);
        return res.status(401).json({ error: "Organization not found - API key invalid" });
      }
      
      const owner = await authStorage.getUser(organization.ownerId);
      if (!owner) {
        console.warn(`[BearerAuth] Organization ${organization.id} has deleted owner ${organization.ownerId}`);
        return res.status(401).json({ error: "Organization owner not found - API key invalid" });
      }
      
      if (!isEnterprise(owner.accountType)) {
        console.warn(`[BearerAuth] API key used but owner ${owner.id} is no longer Enterprise tier`);
        return res.status(403).json({ 
          error: "Enterprise subscription required",
          message: "API access requires an active Enterprise subscription." 
        });
      }
      
      if (owner.deletedAt) {
        console.warn(`[BearerAuth] API key used but owner ${owner.id} has been deleted`);
        return res.status(401).json({ error: "Account suspended - API key invalid" });
      }
      
      await authStorage.updateApiKeyLastUsed(apiKey.id);
      
      const reqAny = req as any;
      reqAny.apiKeyAuth = {
        apiKeyId: apiKey.id,
        organizationId: apiKey.organizationId,
        ownerId: owner.id,
      };
      reqAny.user = owner;
      reqAny.session = reqAny.session || {};
      reqAny.session.userId = owner.id;
      
      next();
    } catch (error: any) {
      console.error("[BearerAuth] Error validating API key:", error);
      return res.status(500).json({ error: "Failed to authenticate" });
    }
  };
}

export function generateApiKey(): { key: string; keyPrefix: string; keyHash: string } {
  const randomPart = crypto.randomBytes(32).toString("hex");
  const key = `${API_KEY_PREFIX}${randomPart}`;
  const keyPrefix = key.substring(0, 16);
  const keyHash = crypto.createHash("sha256").update(key).digest("hex");
  
  return { key, keyPrefix, keyHash };
}
