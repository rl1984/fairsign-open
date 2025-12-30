import { createApp, startServer, log } from "./index";
import { registerEnterpriseRoutes, getEnterpriseFeatures } from "./ee";
import { authStorage } from "../server/replit_integrations/auth/storage";
import { isAuthenticated } from "../server/replit_integrations/auth";

async function main() {
  const { app, httpServer } = await createApp();

  registerEnterpriseRoutes(app, authStorage, isAuthenticated);
  
  const features = getEnterpriseFeatures();
  log(`Enterprise features enabled: ${JSON.stringify(features)}`, "ee");

  await startServer({ app, httpServer });
}

main().catch(console.error);
