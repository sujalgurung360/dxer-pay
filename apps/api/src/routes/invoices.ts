import { Router, Request, Response, NextFunction } from 'express';
import { createInvoiceSchema, updateInvoiceSchema, invoiceFilterSchema, calculateInvoiceTotals } from '@dxer/shared';
import { prisma } from '../lib/prisma.js';
import { authenticate, resolveOrg, requireRole, AuthenticatedRequest } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { NotFoundError, ForbiddenError, AppError } from '../lib/errors.js';
import { writeAuditLog, getClientInfo } from '../services/audit.js';
import { generateInvoiceHtml } from '../services/invoice-pdf.js';
import { Prisma } from '@prisma/client';
import { triggerAutoAnchor } from '../middleware/auto-anchor.js';

export const invoiceRoutes = Router();
invoiceRoutes.use(authenticate, resolveOrg);

// GET /api/invoices
invoiceRoutes.get('/', requireRole('viewer'), validateQuery(invoiceFilterSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const q = (req as any).validatedQuery;

      const where: Prisma.invoicesWhereInput = { org_id: authReq.orgId! };
      if (q.status) where.status = q.status;
      if (q.customerId) where.customer_id = q.customerId;
      if (q.search) where.invoice_number = { contains: q.search, mode: 'insensitive' };

      const [total, invoices] = await Promise.all([
        prisma.invoices.count({ where }),
        prisma.invoices.findMany({
          where,
          include: { customer: true, line_items: true },
          orderBy: { created_at: q.sortOrder },
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
      ]);

      res.json({
        success: true,
        data: invoices.map((inv) => ({
          id: inv.id,
          invoiceNumber: inv.invoice_number,
          status: inv.status,
          dueDate: inv.due_date.toISOString().split('T')[0],
          currency: inv.currency,
          subtotal: Number(inv.subtotal),
          taxRate: Number(inv.tax_rate),
          taxAmount: Number(inv.tax_amount),
          total: Number(inv.total),
          customerName: inv.customer.name,
          customerId: inv.customer_id,
          lineItemCount: inv.line_items.length,
          multichainTxid: inv.multichain_txid,
          polygonTxhash: inv.polygon_txhash,
          createdAt: inv.created_at.toISOString(),
        })),
        pagination: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) },
      });
    } catch (err) { next(err); }
  }
);

// GET /api/invoices/:id
invoiceRoutes.get('/:id', requireRole('viewer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const invoice = await prisma.invoices.findFirst({
        where: { id: req.params.id, org_id: authReq.orgId! },
        include: { customer: true, line_items: true },
      });

      if (!invoice) throw new NotFoundError('Invoice', req.params.id);

      res.json({
        success: true,
        data: {
          id: invoice.id,
          invoiceNumber: invoice.invoice_number,
          status: invoice.status,
          dueDate: invoice.due_date.toISOString().split('T')[0],
          currency: invoice.currency,
          subtotal: Number(invoice.subtotal),
          taxRate: Number(invoice.tax_rate),
          taxAmount: Number(invoice.tax_amount),
          total: Number(invoice.total),
          notes: invoice.notes,
          customerId: invoice.customer_id,
          customer: {
            id: invoice.customer.id,
            name: invoice.customer.name,
            email: invoice.customer.email,
            address: invoice.customer.address,
            taxId: invoice.customer.tax_id,
          },
          lineItems: invoice.line_items.map((li) => ({
            id: li.id,
            description: li.description,
            quantity: Number(li.quantity),
            unitPrice: Number(li.unit_price),
            amount: Number(li.amount),
          })),
          multichainDataHex: invoice.multichain_data_hex,
          multichainTxid: invoice.multichain_txid,
          polygonTxhash: invoice.polygon_txhash,
          createdBy: invoice.created_by,
          createdAt: invoice.created_at.toISOString(),
          updatedAt: invoice.updated_at.toISOString(),
        },
      });
    } catch (err) { next(err); }
  }
);

// GET /api/invoices/:id/pdf - Render invoice as HTML (client prints to PDF)
invoiceRoutes.get('/:id/pdf', requireRole('viewer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const invoice = await prisma.invoices.findFirst({
        where: { id: req.params.id, org_id: authReq.orgId! },
        include: { customer: true, line_items: true },
      });

      if (!invoice) throw new NotFoundError('Invoice', req.params.id);

      const org = await prisma.organizations.findUnique({ where: { id: authReq.orgId! } });

      const html = generateInvoiceHtml(
        {
          invoiceNumber: invoice.invoice_number,
          status: invoice.status,
          dueDate: invoice.due_date.toISOString().split('T')[0],
          currency: invoice.currency,
          subtotal: Number(invoice.subtotal),
          taxRate: Number(invoice.tax_rate),
          taxAmount: Number(invoice.tax_amount),
          total: Number(invoice.total),
          notes: invoice.notes,
          createdAt: invoice.created_at.toISOString(),
          lineItems: invoice.line_items.map((li) => ({
            description: li.description,
            quantity: Number(li.quantity),
            unitPrice: Number(li.unit_price),
            amount: Number(li.amount),
          })),
        },
        {
          name: invoice.customer.name,
          email: invoice.customer.email,
          address: invoice.customer.address,
          taxId: invoice.customer.tax_id,
        },
        org?.name || 'DXER',
      );

      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (err) { next(err); }
  }
);

// POST /api/invoices
invoiceRoutes.post('/', requireRole('accountant'), validateBody(createInvoiceSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const data = req.body;

      // Verify customer belongs to org
      const customer = await prisma.customers.findFirst({
        where: { id: data.customerId, org_id: authReq.orgId! },
      });
      if (!customer) throw new NotFoundError('Customer', data.customerId);

      // Generate invoice number
      const seq = await prisma.dxer_sequences.upsert({
        where: { org_id_seq_name: { org_id: authReq.orgId!, seq_name: 'invoice' } },
        create: { org_id: authReq.orgId!, seq_name: 'invoice', current_val: 1 },
        update: { current_val: { increment: 1 } },
      });
      const invoiceNumber = data.invoiceNumber || `INV-${String(seq.current_val).padStart(6, '0')}`;

      // Calculate totals
      const { subtotal, taxAmount, total } = calculateInvoiceTotals(data.lineItems, data.taxRate);

      const invoice = await prisma.invoices.create({
        data: {
          org_id: authReq.orgId!,
          created_by: authReq.userId,
          customer_id: data.customerId,
          invoice_number: invoiceNumber,
          due_date: new Date(data.dueDate),
          currency: data.currency,
          subtotal,
          tax_rate: data.taxRate,
          tax_amount: taxAmount,
          total,
          notes: data.notes,
          line_items: {
            create: data.lineItems.map((li: any) => ({
              description: li.description,
              quantity: li.quantity,
              unit_price: li.unitPrice,
              amount: li.quantity * li.unitPrice,
            })),
          },
        },
      });

      await writeAuditLog({
        orgId: authReq.orgId!,
        userId: authReq.userId,
        action: 'create',
        entityType: 'invoice',
        entityId: invoice.id,
        after: { invoiceNumber, total, customerId: data.customerId },
        ...getClientInfo(req),
      });

      triggerAutoAnchor({ entityType: 'invoice', entityId: invoice.id, orgId: authReq.orgId!, userId: authReq.userId, action: 'create' });

      res.status(201).json({ success: true, data: { id: invoice.id, invoiceNumber } });
    } catch (err) { next(err); }
  }
);

// POST /api/invoices/:id/status
invoiceRoutes.post('/:id/status', requireRole('accountant'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { status } = req.body;

      const validTransitions: Record<string, string[]> = {
        draft: ['sent', 'void'],
        sent: ['paid', 'void'],
        paid: [],
        void: [],
      };

      const invoice = await prisma.invoices.findFirst({
        where: { id: req.params.id, org_id: authReq.orgId! },
      });

      if (!invoice) throw new NotFoundError('Invoice', req.params.id);

      if (!validTransitions[invoice.status]?.includes(status)) {
        throw new AppError(400, 'INVALID_TRANSITION', `Cannot transition from ${invoice.status} to ${status}`);
      }

      await prisma.invoices.update({
        where: { id: req.params.id },
        data: { status },
      });

      await writeAuditLog({
        orgId: authReq.orgId!,
        userId: authReq.userId,
        action: 'status_change',
        entityType: 'invoice',
        entityId: req.params.id,
        before: { status: invoice.status },
        after: { status },
        ...getClientInfo(req),
      });

      triggerAutoAnchor({ entityType: 'invoice', entityId: req.params.id, orgId: authReq.orgId!, userId: authReq.userId, action: 'status_change' });

      res.json({ success: true, data: { id: req.params.id, status } });
    } catch (err) { next(err); }
  }
);
