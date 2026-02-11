import { Router, Request, Response, NextFunction } from 'express';
import { createOrgSchema, updateOrgSchema, inviteMemberSchema, updateMemberRoleSchema } from '@dxer/shared';
import { prisma } from '../lib/prisma.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { authenticate, resolveOrg, requireRole, AuthenticatedRequest } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { NotFoundError, ConflictError, ForbiddenError } from '../lib/errors.js';
import { writeAuditLog, getClientInfo } from '../services/audit.js';
import { logger } from '../lib/logger.js';
import { triggerAutoAnchor } from '../middleware/auto-anchor.js';

export const orgRoutes = Router();

// All routes require authentication
orgRoutes.use(authenticate);

// POST /api/organizations - Create organization
orgRoutes.post('/', validateBody(createOrgSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { name, slug } = req.body;

    // Check slug uniqueness
    const existing = await prisma.organizations.findUnique({ where: { slug } });
    if (existing) {
      throw new ConflictError('Organization slug already taken');
    }

    // Create org and add creator as owner
    const org = await prisma.organizations.create({
      data: {
        name,
        slug,
        owner_id: authReq.userId,
        members: {
          create: {
            user_id: authReq.userId,
            role: 'owner',
          },
        },
      },
      include: { members: true },
    });

    await writeAuditLog({
      orgId: org.id,
      userId: authReq.userId,
      action: 'create',
      entityType: 'organization',
      entityId: org.id,
      after: { name, slug },
      ...getClientInfo(req),
    });

    logger.info({ orgId: org.id, userId: authReq.userId }, 'Organization created');

    res.status(201).json({
      success: true,
      data: { id: org.id, name: org.name, slug: org.slug, ownerId: org.owner_id },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/organizations - List user's organizations
orgRoutes.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const memberships = await prisma.organization_members.findMany({
      where: { user_id: authReq.userId },
      include: { organization: true },
    });

    res.json({
      success: true,
      data: memberships.map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        role: m.role,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/organizations/current - Get current org details
orgRoutes.get('/current', resolveOrg, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const org = await prisma.organizations.findUnique({
      where: { id: authReq.orgId },
      include: {
        members: {
          include: {
            // We'll join profiles manually
          },
        },
      },
    });

    if (!org) throw new NotFoundError('Organization');

    // Get profiles for members
    const memberProfiles = await prisma.profiles.findMany({
      where: { user_id: { in: org.members.map((m) => m.user_id) } },
    });

    const profileMap = new Map(memberProfiles.map((p) => [p.user_id, p]));

    res.json({
      success: true,
      data: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        ownerId: org.owner_id,
        members: org.members.map((m) => {
          const profile = profileMap.get(m.user_id);
          return {
            id: m.id,
            userId: m.user_id,
            role: m.role,
            fullName: profile?.full_name || 'Unknown',
            email: profile?.email || '',
          };
        }),
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/organizations/invite - Invite member
orgRoutes.post('/invite', resolveOrg, requireRole('admin'), validateBody(inviteMemberSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { email, role } = req.body;

      // Find or create user
      let targetUserId: string;

      // Check if user exists in profiles
      const existingProfile = await prisma.profiles.findFirst({
        where: { email },
      });

      if (existingProfile) {
        targetUserId = existingProfile.user_id;
      } else {
        // Create a Supabase user with a random password (they'll need to reset)
        const { data: newUser, error } = await supabaseAdmin.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: { full_name: email.split('@')[0] },
        });

        if (error) throw new ConflictError(`Failed to create user: ${error.message}`);
        targetUserId = newUser.user.id;
      }

      // Check if already a member
      const existingMember = await prisma.organization_members.findUnique({
        where: {
          org_id_user_id: {
            org_id: authReq.orgId!,
            user_id: targetUserId,
          },
        },
      });

      if (existingMember) {
        throw new ConflictError('User is already a member of this organization');
      }

      // Prevent creating additional owners
      if (role === 'owner') {
        throw new ForbiddenError('Cannot assign owner role through invitation');
      }

      const member = await prisma.organization_members.create({
        data: {
          org_id: authReq.orgId!,
          user_id: targetUserId,
          role,
        },
      });

      await writeAuditLog({
        orgId: authReq.orgId!,
        userId: authReq.userId,
        action: 'create',
        entityType: 'organization_member',
        entityId: member.id,
        after: { email, role },
        ...getClientInfo(req),
      });

      triggerAutoAnchor({ entityType: 'organization_member', entityId: member.id, orgId: authReq.orgId!, userId: authReq.userId, action: 'create' });

      res.status(201).json({
        success: true,
        data: { id: member.id, userId: targetUserId, role: member.role },
      });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/organizations/members/:memberId/role
orgRoutes.patch('/members/:memberId/role', resolveOrg, requireRole('admin'), validateBody(updateMemberRoleSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { memberId } = req.params;
      const { role } = req.body;

      const member = await prisma.organization_members.findFirst({
        where: { id: memberId, org_id: authReq.orgId! },
      });

      if (!member) throw new NotFoundError('Member');
      if (member.role === 'owner') throw new ForbiddenError('Cannot change owner role');

      const before = { role: member.role };
      const updated = await prisma.organization_members.update({
        where: { id: memberId },
        data: { role },
      });

      await writeAuditLog({
        orgId: authReq.orgId!,
        userId: authReq.userId,
        action: 'update',
        entityType: 'organization_member',
        entityId: memberId,
        before,
        after: { role },
        ...getClientInfo(req),
      });

      triggerAutoAnchor({ entityType: 'organization_member', entityId: memberId, orgId: authReq.orgId!, userId: authReq.userId, action: 'update' });

      res.json({ success: true, data: { id: updated.id, role: updated.role } });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/organizations/connect-metamask - Link MetaMask wallet to org
orgRoutes.post('/connect-metamask', resolveOrg, requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { metamaskAddress } = req.body;

      if (!metamaskAddress || !metamaskAddress.startsWith('0x') || metamaskAddress.length !== 42) {
        throw new NotFoundError('Valid Ethereum address required (0x... 42 chars)');
      }

      const org = await prisma.organizations.update({
        where: { id: authReq.orgId! },
        data: { metamask_address: metamaskAddress },
      });

      await writeAuditLog({
        orgId: authReq.orgId!,
        userId: authReq.userId,
        action: 'update',
        entityType: 'organization',
        entityId: authReq.orgId!,
        before: { metamask_address: null },
        after: { metamask_address: metamaskAddress },
        ...getClientInfo(req),
      });

      logger.info({ orgId: authReq.orgId, metamaskAddress }, 'MetaMask wallet linked to org');

      res.json({
        success: true,
        data: {
          walletAddress: org.wallet_address,
          metamaskAddress: org.metamask_address,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/organizations/wallet - Get org wallet info
orgRoutes.get('/wallet', resolveOrg, requireRole('viewer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const org = await prisma.organizations.findUnique({
        where: { id: authReq.orgId! },
        select: {
          wallet_address: true,
          metamask_address: true,
          name: true,
        },
      });

      if (!org) throw new NotFoundError('Organization');

      res.json({
        success: true,
        data: {
          orgName: org.name,
          walletAddress: org.wallet_address,
          metamaskAddress: org.metamask_address,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/organizations/resolve-address/:address - Find org by wallet address
// Used by DXEXPLORER to show inter-org relationships
orgRoutes.get('/resolve-address/:address', resolveOrg, requireRole('viewer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { address } = req.params;

      const org = await prisma.organizations.findFirst({
        where: {
          OR: [
            { wallet_address: address },
            { metamask_address: address },
          ],
        },
        select: {
          id: true,
          name: true,
          slug: true,
          wallet_address: true,
        },
      });

      res.json({
        success: true,
        data: org ? {
          id: org.id,
          name: org.name,
          slug: org.slug,
          walletAddress: org.wallet_address,
          isDxerOrg: true,
        } : {
          address,
          isDxerOrg: false,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);
