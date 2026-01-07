import type { Request, Response, NextFunction } from "express";
import type { IAuthStorage } from "../replit_integrations/auth/storage";
import { isProOrHigher, isEnterprise, getTierLimits } from "../../shared/models/auth";
import { db } from "../db";
import { apiCallLogs } from "../../shared/schema";

export type FeatureType = "bulk_send" | "data_residency" | "api_access";

export function createFeatureAccessMiddleware(authStorage: IAuthStorage) {
  return function checkFeatureAccess(feature: FeatureType) {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        // Support both session-based auth and passport-based auth
        const reqAny = req as any;
        const userId = reqAny.session?.userId || reqAny.user?.id;
        if (!userId) {
          return res.status(401).json({ error: "Authentication required" });
        }

        const user = await authStorage.getUser(userId);
        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }

        const accountType = user.accountType || "free";
        const tierLimits = getTierLimits(accountType);

        switch (feature) {
          case "bulk_send": {
            if (!isEnterprise(accountType)) {
              return res.status(403).json({
                error: "Enterprise subscription required",
                message: "Bulk Send is an Enterprise-only feature. Upgrade to Enterprise to send documents to multiple recipients at once.",
                feature: "bulk_send",
              });
            }
            break;
          }

          case "data_residency": {
            if (!isEnterprise(accountType)) {
              return res.status(403).json({
                error: "Enterprise subscription required",
                message: "Data Residency is an Enterprise-only feature. Upgrade to Enterprise to change your data region.",
                feature: "data_residency",
              });
            }
            break;
          }

          case "api_access": {
            // Check if the tier allows API access (apiCallsPerMonth > 0)
            const apiQuotaFromTier = tierLimits.apiCallsPerMonth;
            if (apiQuotaFromTier <= 0) {
              return res.status(403).json({
                error: "Enterprise subscription required",
                message: "API Access is an Enterprise-only feature. Upgrade to Enterprise to use the Embedded Signing API.",
                feature: "api_access",
              });
            }

            const now = new Date();
            const billingPeriodStart = user.billingPeriodStart ? new Date(user.billingPeriodStart) : null;
            
            let currentApiCalls = user.apiCallsCount || 0;
            // Use user's stored quota limit if set, otherwise fall back to tier limits
            const apiQuotaLimit = user.apiQuotaLimit > 0 ? user.apiQuotaLimit : apiQuotaFromTier;

            // Lazy reset: if billing period is older than 1 month, reset usage
            if (billingPeriodStart) {
              const oneMonthAgo = new Date(now);
              oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

              if (billingPeriodStart < oneMonthAgo) {
                await authStorage.resetApiUsage(userId, now);
                currentApiCalls = 0;
              }
            } else {
              // No billing period set - initialize it now (first API call ever)
              await authStorage.setApiQuotaLimit(userId, apiQuotaLimit, now);
            }

            if (currentApiCalls >= apiQuotaLimit) {
              return res.status(429).json({
                error: "API quota exceeded",
                message: `Monthly API Limit Reached (${currentApiCalls}/${apiQuotaLimit}). Upgrade for higher limits or wait until your billing cycle resets.`,
                feature: "api_access",
                usage: {
                  current: currentApiCalls,
                  limit: apiQuotaLimit,
                },
              });
            }

            await authStorage.incrementApiUsage(userId);
            
            // Log API call for analytics
            const endpoint = req.originalUrl || req.url;
            const method = req.method;
            res.on("finish", async () => {
              try {
                await db.insert(apiCallLogs).values({
                  userId,
                  endpoint,
                  method,
                  statusCode: res.statusCode,
                });
              } catch (err) {
                console.error("[FeatureAccess] Failed to log API call:", err);
              }
            });
            break;
          }

          default:
            return res.status(400).json({ error: "Unknown feature type" });
        }

        next();
      } catch (error: any) {
        console.error("[FeatureAccess] Error checking feature access:", error);
        return res.status(500).json({ error: "Failed to verify feature access" });
      }
    };
  };
}
