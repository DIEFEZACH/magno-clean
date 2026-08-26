import * as Sentry from "@sentry/node";
import { env } from "../config/env";

Sentry.init({
  dsn: env.ERROR_TRACKING_DSN,
  enabled: Boolean(env.ERROR_TRACKING_DSN),
  environment: env.NODE_ENV,
  sendDefaultPii: false,
  beforeSend(event) {
    if (event.request) {
      delete event.request.data;
      if (event.request.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
      }
    }
    return event;
  },
});

export function captureException(error: unknown, requestId?: string) {
  if (!env.ERROR_TRACKING_DSN) return;
  Sentry.withScope((scope) => {
    if (requestId) scope.setTag("requestId", requestId);
    Sentry.captureException(error);
  });
}

export async function flushErrorTracking(timeout = 2_000) {
  if (env.ERROR_TRACKING_DSN) await Sentry.flush(timeout);
}
