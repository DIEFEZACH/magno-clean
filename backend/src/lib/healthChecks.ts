import type { RequestHandler } from "express";
import type { PrismaClient } from "@prisma/client";

const READY_HTTP_TIMEOUT_MS = 3_000;

/** Only a connectivity probe; the timeout is local to this transaction. */
export async function probeDatabase(client: Pick<PrismaClient, "$transaction">): Promise<void> {
  await client.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL statement_timeout = '1000ms'`;
    await tx.$queryRaw`SELECT 1`;
  }, { maxWait: 1_000, timeout: 1_500 });
}

export function createHealthChecks(checkDatabase: () => Promise<void>, isShuttingDown: () => boolean) {
  // Coalesce concurrent probes, including after HTTP timeout. A slow driver must
  // not create a growing queue of abandoned DB work for each readiness request.
  let pending: Promise<boolean> | null = null;

  function startProbe() {
    const probe = Promise.resolve().then(checkDatabase);
    let timer: NodeJS.Timeout;
    // Share the deadline too: after it expires, later requests reuse false
    // without attaching more reactions to a driver promise that may be stuck.
    const outcome = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), READY_HTTP_TIMEOUT_MS);
      void probe.then(() => resolve(true), () => resolve(false));
    });
    pending = outcome;
    const clear = () => {
      clearTimeout(timer);
      if (pending === outcome) pending = null;
    };
    void probe.then(clear, clear);
    return outcome;
  }

  const health: RequestHandler = (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const closing = isShuttingDown();
    res.status(closing ? 503 : 200).json({ status: closing ? "shutting_down" : "ok" });
  };

  const ready: RequestHandler = async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (isShuttingDown()) return void res.status(503).json({ status: "not_ready" });
    const available = await (pending || startProbe());
    if (!available || isShuttingDown()) return void res.status(503).json({ status: "not_ready" });
    res.json({ status: "ready" });
  };

  return { health, ready };
}
