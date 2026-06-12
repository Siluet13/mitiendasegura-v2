import express from "express";
import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth";
import { registerInventoryRoutes } from "./api/inventory";
import { registerDashboardRoutes } from "./api/dashboard";
import { registerSettingsRoutes } from "./api/settings";

const app = express();
app.use(express.json());

(async () => {
  await setupAuth(app);
  registerAuthRoutes(app);
  registerInventoryRoutes(app);
  registerDashboardRoutes(app);
  registerSettingsRoutes(app);

  const port = parseInt(process.env.PORT ?? "5001");
  app.listen(port, "0.0.0.0", () => {
    console.log(`API server running on port ${port}`);
  });
})();
