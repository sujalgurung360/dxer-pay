import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.js';
import { enqueueAnchor } from '../services/auto-anchor.js';
import { logger } from '../lib/logger.js';

/**
 * ═══════════════════════════════════════════════════════════════
 * Auto-Anchor Middleware
 * ═══════════════════════════════════════════════════════════════
 *
 * Intercepts successful write responses and automatically
 * enqueues the affected record for blockchain anchoring.
 *
 * Usage in routes:
 *   router.post('/expenses', ..., autoAnchor('expense'), handler);
 *   -- or --
 *   Call triggerAutoAnchor() directly in your route handler
 * ═══════════════════════════════════════════════════════════════
 */

/**
 * Trigger auto-anchoring for a specific record.
 * Call this directly from route handlers after a successful write.
 *
 * This is non-blocking — fires and forgets.
 */
export function triggerAutoAnchor(params: {
  entityType: string;
  entityId: string;
  orgId: string;
  userId: string;
  action: string;
}): void {
  // Don't block the response — just enqueue
  try {
    enqueueAnchor(params);
  } catch (err: any) {
    // Never let anchoring failure affect the API response
    logger.error({ error: err.message, ...params }, 'Auto-anchor trigger failed');
  }
}

/**
 * Express middleware factory that auto-anchors after response.
 * Wraps res.json to detect successful writes and enqueue anchoring.
 *
 * @param entityType - The entity type being written
 * @param options - Configuration
 */
export function autoAnchorMiddleware(
  entityType: string,
  options: {
    idExtractor?: (body: any) => string;
    action?: string;
  } = {},
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);

    res.json = function (body: any) {
      // Only anchor on success (2xx)
      if (res.statusCode >= 200 && res.statusCode < 300 && body?.success) {
        const authReq = req as AuthenticatedRequest;
        const entityId = options.idExtractor
          ? options.idExtractor(body)
          : body?.data?.id || req.params?.id;
        const action = options.action || detectAction(req.method, req.path);

        if (entityId && authReq.orgId && authReq.userId) {
          triggerAutoAnchor({
            entityType,
            entityId,
            orgId: authReq.orgId,
            userId: authReq.userId,
            action,
          });
        }
      }

      return originalJson(body);
    } as any;

    next();
  };
}

function detectAction(method: string, path: string): string {
  if (path.includes('/void')) return 'void';
  if (path.includes('/status')) return 'status_change';
  if (path.includes('/complete')) return 'status_change';
  if (method === 'POST') return 'create';
  if (method === 'PUT' || method === 'PATCH') return 'update';
  return 'write';
}
