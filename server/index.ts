import express from "express";
import { existsSync } from "fs";
import { join } from "path";
import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth";
import { registerInventoryRoutes } from "./api/inventory";
import { registerDashboardRoutes } from "./api/dashboard";
import { registerSettingsRoutes } from "./api/settings";
import { registerBackupRoutes } from "./api/backup";
import { registerCashRoutes } from "./api/cash";
import { registerLicenseRoutes } from "./api/license";
import { registerBillingRoutes } from "./api/billing";
import { registerAdminRoutes } from "./api/admin";
import { registerEventsRoutes } from "./api/events";
import { registerReceiptsRoutes } from "./api/receipts";
import { registerLogsRoutes } from "./api/logs";
import { logEvent } from "./lib/logger";
import { checkLicense } from "./middleware/license";
import { resolveTenant } from "./middleware/tenant";

const app = express();
app.use(express.json({ limit: "20mb" }));

const clientDir = join(process.cwd(), "dist/client");
const ssrBundle = join(process.cwd(), "dist/server/server.js");

if (existsSync(clientDir)) {
  const sendStatic = (file: string) => (_req: express.Request, res: express.Response) =>
    res.sendFile(join(clientDir, file));

  for (const f of ["manifest.json", "sw.js", "offline.html", "favicon.ico"]) {
    app.get(`/${f}`, sendStatic(f));
  }
  app.get("/icons/*splat", (req, res) =>
    res.sendFile(join(clientDir, "icons", [].concat((req.params as any).splat).join("/")))
  );
  app.get("/assets/*splat", (req, res) =>
    res.sendFile(join(clientDir, "assets", [].concat((req.params as any).splat).join("/")))
  );
}

(async () => {
  await setupAuth(app);
  app.use(resolveTenant);
  registerAuthRoutes(app);
  registerEventsRoutes(app);
  registerLicenseRoutes(app);
  registerBillingRoutes(app);
  registerAdminRoutes(app);
  registerLogsRoutes(app);

  app.use("/api", checkLicense);

  registerInventoryRoutes(app);
  registerDashboardRoutes(app);
  registerSettingsRoutes(app);
  registerReceiptsRoutes(app);
  registerBackupRoutes(app);
  registerCashRoutes(app);

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  if (existsSync(ssrBundle)) {
    const ssrMod = await import(ssrBundle);
    const ssrFetch: (req: Request, env: object, ctx: object) => Promise<Response> =
      ssrMod.default.fetch;

    const ssrHandler = async (req: express.Request, res: express.Response) => {
      try {
        const proto = req.headers["x-forwarded-proto"] ?? req.protocol;
        const host = req.headers["x-forwarded-host"] ?? req.get("host");
        const url = `${proto}://${host}${req.originalUrl}`;
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(req.headers)) {
          if (typeof v === "string") headers[k] = v;
          else if (Array.isArray(v)) headers[k] = v[0];
        }
        const fetchReq = new Request(url, { method: "GET", headers });
        const response = await ssrFetch(fetchReq, {}, {});
        res.status(response.status);
        response.headers.forEach((v: string, k: string) => res.setHeader(k, v));
        res.send(await response.text());
      } catch (e) {
        res.status(500).send(String(e));
      }
    };

    app.get("/", ssrHandler);
    app.get("*splat", ssrHandler);
  }

  app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = typeof err?.status === "number" ? err.status : 500;
    const message = err?.message ?? "Error interno del servidor";
    const code = err?.code ?? undefined;
    if (!res.headersSent) {
      res.status(status).json({ error: message, ...(code ? { code } : {}) });
    }
    if (status === 500) {
      logEvent({ level: "error", module: "system", event: "HTTP_500", message: message.slice(0, 500), userId: (req as any).user?.claims?.sub ?? null, ownerId: (req as any).user?.claims?.sub ?? null, tenantId: (req as any).tenantId ?? null, details: { path: req.path, method: req.method } });
    }
  });

  const port = parseInt(process.env.PORT ?? "5001");
  app.listen(port, "0.0.0.0", () => {
    console.log(`API server running on port ${port}`);
  });
})();
