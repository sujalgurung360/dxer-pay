import { Router, Request, Response, NextFunction } from 'express';
import { ethers } from 'ethers';
import { supabaseAdmin } from '../lib/supabase.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { triggerAutoAnchor } from '../middleware/auto-anchor.js';
import { encryptPrivateKey, decryptPrivateKey } from '../lib/wallet-crypto.js';
import { recordHireOnChain } from '../lib/hiring-contract.js';
import { writeAuditLog } from '../services/audit.js';

export const onboardingRoutes = Router();

/**
 * Helper: find employee by invite token and validate expiry.
 */
async function findEmployeeByToken(token: string) {
  if (!token) throw new AppError(400, 'MISSING_TOKEN', 'Invite token is required');

  const employee = await prisma.employees.findUnique({
    where: { invite_token: token },
    include: { organization: true },
  });

  if (!employee) {
    throw new AppError(404, 'INVALID_TOKEN', 'Invalid or expired invite token');
  }

  if (employee.invite_expires_at && new Date() > employee.invite_expires_at) {
    throw new AppError(410, 'TOKEN_EXPIRED', 'This invitation has expired. Please contact your administrator.');
  }

  return employee;
}

// ─── GET /api/onboarding/validate?token=xxx ─────────────────────
// Public endpoint — validates the invite token and returns org/position info
onboardingRoutes.get('/validate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.query.token as string;
    const employee = await findEmployeeByToken(token);

    res.json({
      success: true,
      data: {
        employeeId: employee.id,
        fullName: employee.full_name,
        email: employee.email,
        position: employee.position,
        department: employee.department,
        organizationName: employee.organization.name,
        onboardingStatus: employee.onboarding_status,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/onboarding/register ──────────────────────────────
// Public endpoint — creates Supabase user, links to employee, sets status to registered
onboardingRoutes.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, fullName, password } = req.body;

    if (!password || password.length < 8) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Password must be at least 8 characters');
    }

    const employee = await findEmployeeByToken(token);

    if (employee.onboarding_status !== 'invited') {
      throw new AppError(400, 'ALREADY_REGISTERED', 'This employee has already registered. Current status: ' + employee.onboarding_status);
    }

    // Create a Supabase user for the employee
    const { data: newUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: employee.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName || employee.full_name },
    });

    if (authError) {
      throw new AppError(400, 'AUTH_ERROR', `Failed to create account: ${authError.message}`);
    }

    const userId = newUser.user.id;

    // Link user_id to the employee record
    await prisma.employees.update({
      where: { id: employee.id },
      data: {
        user_id: userId,
        full_name: fullName || employee.full_name,
        onboarding_status: 'registered',
      },
    });

    // Also create organization_members entry so the employee can log in as a viewer
    await prisma.organization_members.create({
      data: {
        org_id: employee.org_id,
        user_id: userId,
        role: 'viewer',
      },
    });

    logger.info({ employeeId: employee.id, userId }, 'Employee registered through onboarding');

    res.json({
      success: true,
      data: {
        employeeId: employee.id,
        userId,
        onboardingStatus: 'registered',
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/onboarding/verify-identity ───────────────────────
// Public endpoint — accepts verification data (framework only)
onboardingRoutes.post('/verify-identity', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, documentType, documentNumber } = req.body;

    const employee = await findEmployeeByToken(token);

    if (employee.onboarding_status !== 'registered') {
      throw new AppError(400, 'INVALID_STATUS', 'Employee must be registered first. Current status: ' + employee.onboarding_status);
    }

    // In a real implementation, this would trigger an ID verification service
    // For the framework, we just record the attempt and mark as verified
    await prisma.employees.update({
      where: { id: employee.id },
      data: {
        onboarding_status: 'verified',
      },
    });

    // Update profile verification status if user_id exists
    if (employee.user_id) {
      await prisma.profiles.update({
        where: { user_id: employee.user_id },
        data: {
          verification_status: 'verified',
          verification_method: 'manual',
        },
      });
    }

    logger.info({ employeeId: employee.id, documentType }, 'Employee identity verified');

    res.json({
      success: true,
      data: {
        employeeId: employee.id,
        onboardingStatus: 'verified',
        documentType,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/onboarding/sign-contract ─────────────────────────
// Public endpoint — records contract agreement
onboardingRoutes.post('/sign-contract', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.body;

    const employee = await findEmployeeByToken(token);

    if (employee.onboarding_status !== 'verified') {
      throw new AppError(400, 'INVALID_STATUS', 'Identity must be verified first. Current status: ' + employee.onboarding_status);
    }

    await prisma.employees.update({
      where: { id: employee.id },
      data: {
        onboarding_status: 'contract_signed',
        contract_signed_at: new Date(),
      },
    });

    logger.info({ employeeId: employee.id }, 'Employee signed employment contract');

    res.json({
      success: true,
      data: {
        employeeId: employee.id,
        onboardingStatus: 'contract_signed',
        contractSignedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/onboarding/complete ──────────────────────────────
// Public endpoint — generates Polygon wallet address, records hire on-chain, and finalizes onboarding
onboardingRoutes.post('/complete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.body;

    const employee = await findEmployeeByToken(token);

    if (employee.onboarding_status !== 'contract_signed') {
      throw new AppError(400, 'INVALID_STATUS', 'Contract must be signed first. Current status: ' + employee.onboarding_status);
    }

    // Generate a Polygon wallet for the employee
    const empWallet = ethers.Wallet.createRandom();
    const walletAddress = empWallet.address;
    const encryptedKey = encryptPrivateKey(empWallet.privateKey);

    // Update employee with wallet and completion status
    await prisma.employees.update({
      where: { id: employee.id },
      data: {
        wallet_address: walletAddress,
        wallet_private_key_enc: encryptedKey,
        onboarding_status: 'completed',
        is_active: true,
      },
    });

    // ─── Record "hired" event on blockchain ───────────────────
    // Creates two-address transactions on Polygon:
    //   1. Org wallet → Employee wallet (POL funding)
    //   2. Org wallet → Employee wallet (DXER hire data)
    // This shows a real org↔employee relationship on PolygonScan
    let hireOnChainResult: any = null;
    try {
      // Get the org's private key for signing
      const org = await prisma.organizations.findUnique({
        where: { id: employee.org_id },
        select: { wallet_private_key_enc: true, wallet_address: true, name: true },
      });

      if (org?.wallet_private_key_enc) {
        const orgPrivateKey = decryptPrivateKey(org.wallet_private_key_enc);

        hireOnChainResult = await recordHireOnChain({
          orgPrivateKey,
          employeeWalletAddress: walletAddress,
          employeeName: employee.full_name,
          position: employee.position || 'Employee',
          employeeId: employee.id,
          orgId: employee.org_id,
        });

        // Update the employee record with the hire transaction hash
        await prisma.employees.update({
          where: { id: employee.id },
          data: {
            polygon_txhash: hireOnChainResult.hireTxHash,
            multichain_data_hex: hireOnChainResult.hireDataHash,
          },
        });

        // Write audit log for the "hired" event
        await writeAuditLog({
          orgId: employee.org_id,
          userId: employee.user_id || employee.id,
          action: 'create',
          entityType: 'employee',
          entityId: employee.id,
          after: {
            event: 'hired',
            employeeName: employee.full_name,
            employeeWallet: walletAddress,
            orgWallet: org.wallet_address,
            hireTxHash: hireOnChainResult.hireTxHash,
            fundTxHash: hireOnChainResult.fundTxHash,
            blockNumber: hireOnChainResult.blockNumber,
          },
          ip_address: req.ip || null,
          user_agent: req.get('user-agent') || null,
        });

        logger.info({
          employeeId: employee.id,
          hireTxHash: hireOnChainResult.hireTxHash,
          fundTxHash: hireOnChainResult.fundTxHash,
          orgAddress: hireOnChainResult.orgAddress,
          employeeAddress: walletAddress,
        }, '🎉 HIRED — Employee onboarding complete with on-chain hire record');
      } else {
        logger.warn({ orgId: employee.org_id }, 'Org has no wallet — hire event not recorded on-chain');
      }
    } catch (err: any) {
      // Don't fail the onboarding if blockchain recording fails
      logger.error({ error: err.message, employeeId: employee.id }, 'Failed to record hire on-chain (non-blocking)');
    }

    // Also trigger the standard auto-anchor for the employee entity
    triggerAutoAnchor({
      entityType: 'employee',
      entityId: employee.id,
      orgId: employee.org_id,
      userId: employee.user_id || employee.id,
      action: 'onboarding_complete',
    });

    logger.info({
      employeeId: employee.id,
      walletAddress,
    }, 'Employee onboarding completed with Polygon wallet');

    res.json({
      success: true,
      data: {
        employeeId: employee.id,
        walletAddress,
        onboardingStatus: 'completed',
        hireTxHash: hireOnChainResult?.hireTxHash || null,
        fundTxHash: hireOnChainResult?.fundTxHash || null,
        explorerUrl: hireOnChainResult?.explorerUrl || null,
        message: 'You\'re hired! Your employment has been recorded on the blockchain.',
      },
    });
  } catch (err) {
    next(err);
  }
});
