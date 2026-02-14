import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, resolveOrg, requireRole, AuthenticatedRequest } from '../middleware/auth.js';
import { extractReceiptFromImage, categorizeExpense } from '../services/ocr.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { AppError } from '../lib/errors.js';
import { randomUUID } from 'crypto';

export const ocrRoutes = Router();
ocrRoutes.use(authenticate, resolveOrg);

/**
 * POST /api/ocr/receipt
 * Body: { image: base64 string }
 * Extracts receipt data using GPT-4 Vision.
 */
ocrRoutes.post('/receipt', requireRole('viewer'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { image } = req.body as { image?: string };
    if (!image || typeof image !== 'string') {
      throw new AppError(400, 'INVALID_BODY', 'image (base64 string) is required');
    }

    const result = await extractReceiptFromImage(image);
    res.json({
      success: true,
      data: {
        merchant: result.merchant,
        amount: result.amount,
        date: result.date,
        lineItems: result.lineItems,
        taxAmount: result.taxAmount,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/ocr/categorize
 * Body: { merchant: string, description: string, amount: number }
 * Returns suggested category from past data or AI.
 */
ocrRoutes.post('/categorize', requireRole('viewer'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { merchant, description, amount } = req.body as {
      merchant?: string;
      description?: string;
      amount?: number;
    };

    if (!authReq.orgId) {
      throw new AppError(403, 'NO_ORG', 'Organization context required');
    }

    const result = await categorizeExpense(
      authReq.orgId,
      merchant ?? '',
      description ?? '',
      Number(amount) || 0
    );

    res.json({
      success: true,
      data: {
        category: result.category,
        confidence: result.confidence,
        accountCode: result.accountCode,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/ocr/upload-receipt
 * Body: { image: base64 string }
 * Stores receipt in Supabase storage, returns signed URL for receipt_url.
 */
ocrRoutes.post('/upload-receipt', requireRole('viewer'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { image } = req.body as { image?: string };
    if (!image || typeof image !== 'string') {
      throw new AppError(400, 'INVALID_BODY', 'image (base64 string) is required');
    }
    if (!authReq.orgId) {
      throw new AppError(403, 'NO_ORG', 'Organization context required');
    }

    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const ext = image.includes('png') ? 'png' : 'jpg';
    const filename = `${authReq.orgId}/${randomUUID()}.${ext}`;

    const { error } = await supabaseAdmin.storage
      .from('receipts')
      .upload(filename, buffer, { contentType: `image/${ext}`, upsert: false });

    if (error) {
      throw new AppError(500, 'UPLOAD_FAILED', error.message);
    }

    const { data: signed } = await supabaseAdmin.storage
      .from('receipts')
      .createSignedUrl(filename, 60 * 60 * 24 * 365); // 1 year

    res.json({
      success: true,
      data: {
        receiptUrl: signed?.signedUrl ?? filename,
        path: filename,
      },
    });
  } catch (err) {
    next(err);
  }
});
