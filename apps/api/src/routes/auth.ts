import { Router, Request, Response, NextFunction } from 'express';
import { ethers } from 'ethers';
import { signUpSchema, signInSchema } from '@dxer/shared';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { prisma } from '../lib/prisma.js';
import { validateBody } from '../middleware/validate.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';
import { AppError } from '../lib/errors.js';
import { encryptPrivateKey } from '../lib/wallet-crypto.js';
import { fundOrgWallet } from '../lib/polygon.js';
import { logger } from '../lib/logger.js';

export const authRoutes = Router();

/**
 * Generate a Polygon-compatible wallet for an organization.
 * Returns { address, encryptedPrivateKey }.
 */
function generateOrgWallet(): { address: string; encryptedPrivateKey: string } {
  const wallet = ethers.Wallet.createRandom();
  return {
    address: wallet.address,
    encryptedPrivateKey: encryptPrivateKey(wallet.privateKey),
  };
}

// POST /api/auth/signup
// Enhanced: accepts org details, generates wallet, creates org automatically
authRoutes.post('/signup', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      email, password, fullName,
      // Organization fields (optional — if provided, org is auto-created)
      orgName, orgSlug, registrationNumber, businessType, country,
      // Verification
      phoneNumber, verificationMethod,
    } = req.body;

    if (!email || !password || !fullName) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Email, password, and full name are required');
    }
    if (password.length < 12) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Password must be at least 12 characters');
    }

    // Basic email format validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid email address format');
    }

    // 1. Create the user in Supabase Auth
    const { data, error } = await getSupabaseAdmin().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (error) {
      // Provide clearer error messages for common Supabase auth failures
      let message = error.message;
      if (message.includes('Database error creating new user')) {
        message = 'This email is already registered. Please sign in or use a different email.';
      } else if (message.includes('already been registered')) {
        message = 'This email is already registered. Please sign in instead.';
      }
      throw new AppError(400, 'AUTH_ERROR', message);
    }

    const userId = data.user.id;

    // 2. Update profile with extra fields
    if (phoneNumber || verificationMethod) {
      await prisma.profiles.update({
        where: { user_id: userId },
        data: {
          phone_number: phoneNumber || null,
          verification_method: verificationMethod || null,
          verification_status: verificationMethod === 'sheerid' ? 'pending' : 'pending',
        },
      });
    }

    // 3. If org details provided, auto-create organization with wallet
    let orgData: any = null;
    if (orgName) {
      const slug = orgSlug || orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

      // Generate a Polygon wallet for this organization
      const wallet = generateOrgWallet();

      // Use try/catch to handle slug uniqueness race condition atomically
      let org;
      try {
        org = await prisma.organizations.create({
          data: {
            name: orgName,
            slug,
            owner_id: userId,
            registration_number: registrationNumber || null,
            business_type: businessType || null,
            country: country || null,
            wallet_address: wallet.address,
            wallet_private_key_enc: wallet.encryptedPrivateKey,
            members: {
              create: {
                user_id: userId,
                role: 'owner',
              },
            },
          },
        });
      } catch (err: any) {
        if (err.code === 'P2002') {
          throw new AppError(409, 'CONFLICT', 'Organization slug already taken. Try a different name.');
        }
        throw err;
      }

      orgData = {
        id: org.id,
        name: org.name,
        slug: org.slug,
        walletAddress: wallet.address,
      };

      logger.info({
        orgId: org.id,
        walletAddress: wallet.address,
        userId,
      }, 'Organization created with Polygon wallet');

      // Auto-fund the new org wallet with a small amount of POL for gas fees
      fundOrgWallet(wallet.address).then((funding) => {
        if (funding) {
          logger.info({
            orgId: org.id,
            walletAddress: wallet.address,
            fundingTx: funding.txHash,
            amount: funding.amount,
          }, 'Org wallet auto-funded with POL');
        }
      }).catch((err) => {
        logger.warn({ error: err.message, orgId: org.id }, 'Failed to auto-fund org wallet');
      });
    }

    logger.info({ userId }, 'User signed up');

    res.status(201).json({
      success: true,
      data: {
        userId,
        email: data.user.email,
        organization: orgData,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/signin
authRoutes.post('/signin', validateBody(signInSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    const { data, error } = await getSupabaseAdmin().auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw new AppError(401, 'AUTH_ERROR', 'Invalid email or password');
    }

    // Also set a cookie so Next middleware can allow /dashboard immediately.
    const host = String(req.headers.host || '');
    const isOnedollar = host === 'onedollarpage.com' || host.endsWith('.onedollarpage.com');
    const isNepalEthereum = host === 'nepalethereum.cor' || host.endsWith('.nepalethereum.cor');
    const isHttps = String(req.headers['x-forwarded-proto'] || '').includes('https') || process.env.NODE_ENV === 'production';
    let cookieDomain = '';
    if (isOnedollar) cookieDomain = '.onedollarpage.com';
    else if (isNepalEthereum) cookieDomain = '.nepalethereum.cor';
    const cookieParts = [
      `dxer_token=${encodeURIComponent(data.session.access_token)}`,
      'Path=/',
      `Max-Age=${60 * 60 * 24 * 7}`,
      'SameSite=Lax',
      isHttps ? 'Secure' : '',
      cookieDomain ? `Domain=${cookieDomain}` : '',
    ].filter(Boolean);
    res.setHeader('Set-Cookie', cookieParts.join('; '));

    res.json({
      success: true,
      data: {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        user: {
          id: data.user.id,
          email: data.user.email,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
authRoutes.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const profile = await prisma.profiles.findUnique({
      where: { user_id: authReq.userId },
    });

    if (!profile) {
      throw new AppError(404, 'NOT_FOUND', 'Profile not found');
    }

    const memberships = await prisma.organization_members.findMany({
      where: { user_id: authReq.userId },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            wallet_address: true,
            metamask_address: true,
            registration_number: true,
            business_type: true,
          },
        },
      },
    });

    res.json({
      success: true,
      data: {
        profile: {
          id: profile.id,
          userId: profile.user_id,
          fullName: profile.full_name,
          email: profile.email,
          avatarUrl: profile.avatar_url,
          phoneNumber: profile.phone_number,
          verificationStatus: profile.verification_status,
          verificationMethod: profile.verification_method,
        },
        organizations: memberships.map((m) => ({
          id: m.organization.id,
          name: m.organization.name,
          slug: m.organization.slug,
          role: m.role,
          walletAddress: m.organization.wallet_address,
          metamaskAddress: m.organization.metamask_address,
          registrationNumber: m.organization.registration_number,
          businessType: m.organization.business_type,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/forgot-password
// Sends a password reset email via Supabase. Always returns success to avoid revealing whether an email exists.
authRoutes.post('/forgot-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;

    if (!email) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Email is required');
    }

    await getSupabaseAdmin().auth.resetPasswordForEmail(email).catch(() => {});

    logger.info({ email }, 'Password reset requested');

    res.json({
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent.',
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/reset-password
authRoutes.post('/reset-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { accessToken, newPassword } = req.body;

    if (!accessToken || !newPassword) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Access token and new password are required');
    }

    if (newPassword.length < 12) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Password must be at least 12 characters');
    }

    const { data: { user }, error: userError } = await getSupabaseAdmin().auth.getUser(accessToken);

    if (userError || !user) {
      throw new AppError(401, 'AUTH_ERROR', 'Invalid or expired reset token');
    }

    const { error: updateError } = await getSupabaseAdmin().auth.admin.updateUserById(user.id, {
      password: newPassword,
    });

    if (updateError) {
      throw new AppError(500, 'AUTH_ERROR', 'Failed to update password');
    }

    logger.info({ userId: user.id }, 'Password reset completed');

    res.json({
      success: true,
      message: 'Password has been reset successfully.',
    });
  } catch (err) {
    next(err);
  }
});
