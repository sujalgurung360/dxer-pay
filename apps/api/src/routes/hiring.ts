import { Router, Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { ethers } from 'ethers';
import { prisma } from '../lib/prisma.js';
import { authenticate, resolveOrg, requireRole, AuthenticatedRequest } from '../middleware/auth.js';
import { AppError } from '../lib/errors.js';
import { writeAuditLog, getClientInfo } from '../services/audit.js';
import { triggerAutoAnchor } from '../middleware/auto-anchor.js';
import { sendOnboardingInvite } from '../lib/email.js';
import { encryptPrivateKey } from '../lib/wallet-crypto.js';
import { logger } from '../lib/logger.js';

export const hiringRoutes = Router();
hiringRoutes.use(authenticate, resolveOrg);

// ─── POST /api/hiring/invite ────────────────────────────────────
// Admin sends an invite to a new employee
hiringRoutes.post('/invite', requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { email, fullName, position, department, salary, currency, role } = req.body;

      if (!email || !fullName) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Email and full name are required');
      }

      // Check if employee with this email already exists in this org
      const existing = await prisma.employees.findFirst({
        where: { org_id: authReq.orgId!, email },
      });

      if (existing) {
        throw new AppError(409, 'CONFLICT', 'An employee with this email already exists in this organization');
      }

      // Generate invite token with 72-hour expiry
      const inviteToken = randomUUID();
      const inviteExpiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

      // Create employee record with invited status
      const employee = await prisma.employees.create({
        data: {
          org_id: authReq.orgId!,
          full_name: fullName,
          email,
          position: position || null,
          department: department || null,
          salary: salary || 0,
          currency: currency || 'USD',
          start_date: new Date(),
          is_active: false, // Not active until onboarding completes
          onboarding_status: 'invited',
          invite_token: inviteToken,
          invite_expires_at: inviteExpiresAt,
        },
      });

      // Build the onboarding URL
      const frontendUrl = process.env.CORS_ORIGIN || 'http://localhost:3000';
      const onboardingUrl = `${frontendUrl}/onboarding?token=${inviteToken}`;

      // Fetch org name for the email
      const org = await prisma.organizations.findUnique({
        where: { id: authReq.orgId! },
        select: { name: true },
      });

      // Send the invitation email
      const emailResult = await sendOnboardingInvite({
        to: email,
        employeeName: fullName,
        organizationName: org?.name || 'Your Organization',
        position: position || null,
        department: department || null,
        onboardingUrl,
        expiresAt: inviteExpiresAt,
      });

      logger.info({
        employeeId: employee.id,
        email,
        emailSent: emailResult.sent,
        onboardingUrl,
      }, emailResult.sent
        ? '📧 EMPLOYEE INVITE — Onboarding email sent'
        : '📧 EMPLOYEE INVITE — Onboarding link generated (SMTP not configured, email not sent)'
      );

      // Write audit log
      await writeAuditLog({
        orgId: authReq.orgId!,
        userId: authReq.userId,
        action: 'create',
        entityType: 'employee',
        entityId: employee.id,
        after: { email, fullName, position, department, salary, status: 'invited' },
        ...getClientInfo(req),
      });

      triggerAutoAnchor({
        entityType: 'employee',
        entityId: employee.id,
        orgId: authReq.orgId!,
        userId: authReq.userId,
        action: 'invite',
      });

      res.status(201).json({
        success: true,
        data: {
          id: employee.id,
          email: employee.email,
          fullName: employee.full_name,
          onboardingStatus: employee.onboarding_status,
          onboardingUrl,
          emailSent: emailResult.sent,
          inviteExpiresAt: inviteExpiresAt.toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/hiring/pipeline ───────────────────────────────────
// Get all employees in the hiring/onboarding pipeline (non-draft status)
hiringRoutes.get('/pipeline', requireRole('viewer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;

      const employees = await prisma.employees.findMany({
        where: {
          org_id: authReq.orgId!,
          onboarding_status: { not: 'draft' },
        },
        orderBy: { created_at: 'desc' },
      });

      res.json({
        success: true,
        data: employees.map((e) => ({
          id: e.id,
          fullName: e.full_name,
          email: e.email,
          position: e.position,
          department: e.department,
          salary: Number(e.salary),
          currency: e.currency,
          onboardingStatus: e.onboarding_status,
          walletAddress: e.wallet_address,
          isActive: e.is_active,
          inviteExpiresAt: e.invite_expires_at?.toISOString() || null,
          contractSignedAt: e.contract_signed_at?.toISOString() || null,
          polygonTxhash: e.polygon_txhash,
          createdAt: e.created_at.toISOString(),
        })),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/hiring/:id/generate-wallet ───────────────────────
// Admin can manually generate a wallet for an employee
hiringRoutes.post('/:id/generate-wallet', requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const employeeId = req.params.id;

      const employee = await prisma.employees.findFirst({
        where: { id: employeeId, org_id: authReq.orgId! },
      });

      if (!employee) {
        throw new AppError(404, 'NOT_FOUND', 'Employee not found');
      }

      if (employee.wallet_address) {
        throw new AppError(400, 'ALREADY_EXISTS', 'Employee already has a wallet address');
      }

      // Generate wallet
      const wallet = ethers.Wallet.createRandom();
      const walletAddress = wallet.address;
      const encryptedKey = encryptPrivateKey(wallet.privateKey);

      await prisma.employees.update({
        where: { id: employeeId },
        data: {
          wallet_address: walletAddress,
          wallet_private_key_enc: encryptedKey,
        },
      });

      await writeAuditLog({
        orgId: authReq.orgId!,
        userId: authReq.userId,
        action: 'update',
        entityType: 'employee',
        entityId: employeeId,
        after: { walletAddress, action: 'generate_wallet' },
        ...getClientInfo(req),
      });

      triggerAutoAnchor({
        entityType: 'employee',
        entityId: employeeId,
        orgId: authReq.orgId!,
        userId: authReq.userId,
        action: 'wallet_generated',
      });

      logger.info({ employeeId, walletAddress }, 'Employee wallet generated by admin');

      res.json({
        success: true,
        data: {
          id: employeeId,
          walletAddress,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);
