import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { randomUUID } from "node:crypto";
import { corsOrigins, env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { authRouter } from "./routes/auth";
import { ordersRouter } from "./routes/orders";
import { productsRouter } from "./routes/products";
import { catalogRouter } from "./routes/catalog";
import { usersRouter } from "./routes/users";
import { checkoutRouter } from "./routes/checkout";
import { paymentsRouter } from "./routes/payments";
import { inventoryRouter } from "./routes/inventory";
import { adminRouter } from "./routes/admin";
import { websiteContentRouter } from "./routes/websiteContent";
import { prisma } from "./lib/prisma";
import { AppError } from "./errors/AppError";
import { flushErrorTracking } from "./lib/errorTracking";
import { createHealthChecks, probeDatabase } from "./lib/healthChecks";

const app = express();
let shuttingDown = false;
const { health, ready } = createHealthChecks(() => probeDatabase(prisma), () => shuttingDown);

app.set("trust proxy", 1);
app.use(pinoHttp({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  redact: [
    "req.headers.authorization", "req.headers.cookie", "res.headers.set-cookie",
    "req.body.password", "req.body.passwordHash", "req.body.accessToken",
    "req.body.refreshToken", "req.body.token",
  ],
  genReqId(req, res) {
    const incoming = req.headers["x-request-id"];
    const requestId = typeof incoming === "string" && /^[a-zA-Z0-9._-]{1,100}$/.test(incoming) ? incoming : randomUUID();
    res.setHeader("x-request-id", requestId);
    return requestId;
  },
  customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
}));
app.use(helmet());
app.use(compression());
app.use(cors({
  origin(origin, callback) {
    if (!origin || corsOrigins.includes(origin)) return callback(null, true);
    callback(new AppError(403, "Origen no permitido por CORS"));
  },
  credentials: true,
}));
// Express matches only its registered GET route (including implicit HEAD).
// Keep request IDs, security headers and CORS, but do not spend business quota.
app.get("/health", health);
app.use(rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === "/api/payments/webhook",
}));
app.use((req, res, next) => {
  const writesBody = ["POST", "PUT", "PATCH"].includes(req.method) && Number(req.headers["content-length"] || 0) > 0;
  const multipartUpload = req.method === "POST" && (
    /^\/api\/admin\/products\/[^/]+\/images\/upload$/.test(req.path) ||
    /^\/api\/admin\/inventory\/import(?:\/preview)?$/.test(req.path)
  );
  if (writesBody && !req.is("application/json") && !(multipartUpload && req.is("multipart/form-data"))) return res.status(415).json({ message: "Content-Type no permitido" });
  next();
});
app.use(express.json({ limit: env.JSON_BODY_LIMIT }));
app.use(cookieParser());

app.get("/", (_req, res) => res.json({ message: "Magno Clean API running" }));
app.get("/ready", ready);
app.use("/api/auth", authRouter);
app.use("/api/checkout", checkoutRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/products", productsRouter);
app.use("/api/catalog", catalogRouter);
app.use("/api/admin/inventory", inventoryRouter);
app.use("/api/admin/website-content", websiteContentRouter);
app.use("/api/admin", adminRouter);
app.use("/api/users", usersRouter);
app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(env.PORT, () => {
  console.log(JSON.stringify({ level: "info", message: "API running", port: env.PORT, environment: env.NODE_ENV }));
});

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(JSON.stringify({ level: "info", message: "Shutting down", signal }));
  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref();
  server.close(async () => {
    await prisma.$disconnect();
    await flushErrorTracking();
    clearTimeout(forceExit);
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
