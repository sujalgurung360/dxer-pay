import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';
import { prisma } from '../lib/prisma.js';
import { UnauthorizedError, ForbiddenError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import type { OrgRole } from '@dxer/shared';
import { hasRole } from '@dxer/shared';

export interface AuthenticatedRequest extends Request {
  userId: string;
  userEmail: string;
  orgId?: string;
  orgRole?: OrgRole;
}

// ─── JWKS client for hosted Supabase (ES256 tokens) ───────────────
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
let jwksClient: jwksRsa.JwksClient | null = null;

if (supabaseUrl && !supabaseUrl.includes('localhost')) {
  jwksClient = jwksRsa({
    jwksUri: `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
    cache: true,
    cacheMaxAge: 600_000, // 10 min
    rateLimit: true,
  });
  logger.info('Auth: using JWKS verification for hosted Supabase');
}

function getJwksSigningKey(kid: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!jwksClient) return reject(new Error('No JWKS client'));
    jwksClient.getSigningKey(kid, (err, key) => {
      if (err) return reject(err);
      resolve(key!.getPublicKey());
    });
  });
}

/**
 * Verify JWT from Supabase Auth and attach userId to request.
 * Supports both HS256 (local Docker Supabase) and ES256 (hosted Supabase).
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid authorization header');
    }

    const token = authHeader.substring(7);

    // Decode header to determine algorithm
    const header = jwt.decode(token, { complete: true })?.header;

    let decoded: { sub: string; email: string; role: string };

    if (header?.alg === 'ES256' && header.kid && jwksClient) {
      // ─── Hosted Supabase: verify with JWKS public key ───
      const publicKey = await getJwksSigningKey(header.kid);
      decoded = jwt.verify(token, publicKey, { algorithms: ['ES256'] }) as any;
    } else {
      // ─── Local Supabase: verify with symmetric HMAC secret ───
      const secret = process.env.SUPABASE_JWT_SECRET;
      if (!secret) {
        logger.error('SUPABASE_JWT_SECRET not configured');
        throw new UnauthorizedError('Server configuration error');
      }
      decoded = jwt.verify(token, secret) as any;
    }

    (req as AuthenticatedRequest).userId = decoded.sub;
    (req as AuthenticatedRequest).userEmail = decoded.email;

    next();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      next(err);
    } else {
      next(new UnauthorizedError('Invalid or expired token'));
    }
  }
}

/**
 * Resolve organization from header and verify membership.
 * The org_id is derived from the user's memberships, NOT trusted from client.
 */
export async function resolveOrg(req: Request, _res: Response, next: NextFunction) {
  try {
    const authReq = req as AuthenticatedRequest;
    const orgId = req.headers['x-org-id'] as string;

    if (!orgId) {
      throw new ForbiddenError('x-org-id header is required');
    }

    // Verify the user is a member of this org
    const membership = await prisma.organization_members.findUnique({
      where: {
        org_id_user_id: {
          org_id: orgId,
          user_id: authReq.userId,
        },
      },
    });

    if (!membership) {
      throw new ForbiddenError('You are not a member of this organization');
    }

    authReq.orgId = orgId;
    authReq.orgRole = membership.role as OrgRole;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Require minimum role level.
 */
export function requireRole(minimumRole: OrgRole) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.orgRole || !hasRole(authReq.orgRole, minimumRole)) {
      next(new ForbiddenError(`Requires at least ${minimumRole} role`));
      return;
    }
    next();
  };
}
