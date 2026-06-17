import express from "express";
import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth";
import { registerInventoryRoutes } from "./api/inventory";
import { registerDashboardRoutes } from "./api/dashboard";
import { registerSettingsRoutes } from "./api/settings";
import { registerBackupRoutes } from "./api/backup";
import { registerLicenseRoutes } from "./api/license";
import { registerAdminRoutes } from "./api/admin";
import { registerEventsRoutes } from "./api/events";
import { checkLicense } from "./middleware/license";
import { resolveTenant } from "./middleware/tenant";

const app = express();
app.use(express.json());

(async () => {
  await setupAuth(app);
  app.use(resolveTenant);
  registerAuthRoutes(app);
  registerEventsRoutes(app);
  registerLicenseRoutes(app);
  registerAdminRoutes(app);

  app.use("/api", checkLicense);

  registerInventoryRoutes(app);
  registerDashboardRoutes(app);
  registerSettingsRoutes(app);
  registerBackupRoutes(app);

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  const port = parseInt(process.env.PORT ?? "5001");
  app.listen(port, "0.0.0.0", () => {
    console.log(`API server running on port ${port}`);
  });
})();
