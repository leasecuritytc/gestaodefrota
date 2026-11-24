import express from "express";
import helmet from "helmet";
import cors from "cors";
import { env } from "./env";
import { authRouter } from "./routes/auth.routes";
import { vehiclesRouter } from "./routes/vehicles.routes";
import { maintenanceRouter } from "./routes/maintenance.routes";
import { dashboardRouter } from "./routes/dashboard.routes";
import { syncRouter } from "./routes/sync.routes";
import { usersRouter } from "./routes/users.routes";
import { occurrencesRouter } from "./routes/occurrences.routes";
import { auditRouter } from "./routes/audit.routes";
import { driversRouter } from "./routes/drivers.routes";
import { basesRouter } from "./routes/bases.routes";
import { bscRouter } from "./routes/bsc.routes";
import { agendarSyncVec } from "./adapters/vecAdapter";

const app = express();

app.use(helmet());
app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRouter);
app.use("/api/vehicles", vehiclesRouter);
app.use("/api/maintenance", maintenanceRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/sync", syncRouter);
app.use("/api/users", usersRouter);
app.use("/api/occurrences", occurrencesRouter);
app.use("/api/audit", auditRouter);
app.use("/api/drivers", driversRouter);
app.use("/api/bases", basesRouter);
app.use("/api/bsc", bscRouter);

// Handler de erro central: nunca vaza stack trace nem detalhe de SQL ao cliente.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: "Erro interno. Tente novamente." });
});

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`GESTÃO DE FROTA API ouvindo na porta ${env.port}`);
  agendarSyncVec();
});
