import type { Express } from "express";
import { registerPaymentRoutes, isPaymentsEnabled } from "./payments";
import type { IAuthStorage } from "../../server/replit_integrations/auth/storage";

export interface EnterpriseFeatures {
  payments: boolean;
  sso: boolean;
}

export function getEnterpriseFeatures(): EnterpriseFeatures {
  return {
    payments: isPaymentsEnabled(),
    sso: false,
  };
}

export function registerEnterpriseRoutes(app: Express, authStorage: IAuthStorage, isAuthenticated: any) {
  const features = getEnterpriseFeatures();
  
  if (features.payments) {
    registerPaymentRoutes(app, authStorage, isAuthenticated);
  }
  
  console.log("[EE] Enterprise features:", features);
}

export { registerPaymentRoutes, isPaymentsEnabled } from "./payments";
