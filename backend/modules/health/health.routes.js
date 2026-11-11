"use strict";

/**
 * Creates the liveness and readiness route handler.
 * Returns null when the request is not owned by this module; handled routes
 * return the response operation (or its promise) so the caller can preserve
 * the existing API dispatch flow.
 */
function createHealthRoutes({ send, cloud, ping, logger = console }) {
  if (typeof send !== "function") throw new TypeError("health routes require send");
  if (typeof ping !== "function") throw new TypeError("health routes require ping");

  return function handleHealthRoute(req, res, url) {
    const pathname = url && url.pathname;

    // Liveness must remain independent of external services and HTTP method.
    if (pathname === "/api/health") {
      return send(res, 200, { ok: true });
    }

    // Preserve the original GET-only readiness behaviour. Other methods fall
    // through to the existing API dispatcher and its middleware.
    if (pathname === "/api/ready" && req.method === "GET") {
      if (!cloud) return send(res, 200, { ok: true, storage: "local" });

      try {
        return Promise.resolve(ping())
          .then(() => send(res, 200, { ok: true, storage: "supabase" }))
          .catch((error) => {
            logger.error("Readiness check failed:", error && error.message);
            return send(res, 503, {
              ok: false,
              error: "Storage dependency unavailable",
            });
          });
      } catch (error) {
        logger.error("Readiness check failed:", error && error.message);
        return send(res, 503, {
          ok: false,
          error: "Storage dependency unavailable",
        });
      }
    }

    return null;
  };
}

module.exports = { createHealthRoutes };
