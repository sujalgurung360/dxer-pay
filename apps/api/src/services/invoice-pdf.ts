import type { Invoice, InvoiceLineItem, Customer, Organization } from '@dxer/shared';
import { formatCurrency, formatDate } from '@dxer/shared';

/**
 * Generate a simple HTML invoice that can be rendered to PDF on the client side.
 * In production, use a library like Puppeteer or a PDF service.
 */
export function generateInvoiceHtml(
  invoice: {
    invoiceNumber: string;
    status: string;
    dueDate: string;
    currency: string;
    subtotal: number;
    taxRate: number;
    taxAmount: number;
    total: number;
    notes: string | null;
    createdAt: string;
    lineItems: { description: string; quantity: number; unitPrice: number; amount: number }[];
  },
  customer: { name: string; email: string | null; address: string | null; taxId: string | null },
  orgName: string,
): string {
  const lineItemsHtml = invoice.lineItems.map((item) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee">${item.description}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${item.quantity}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${formatCurrency(item.unitPrice, invoice.currency)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${formatCurrency(item.amount, invoice.currency)}</td>
    </tr>
  `).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Invoice ${invoice.invoiceNumber}</title>
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #333; max-width: 800px; margin: 0 auto; padding: 40px; }
    .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
    .invoice-title { font-size: 28px; font-weight: bold; color: #1a1a1a; }
    .meta-label { color: #666; font-size: 12px; text-transform: uppercase; }
    .status { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; text-transform: uppercase; }
    .status-draft { background: #f3f4f6; color: #6b7280; }
    .status-sent { background: #dbeafe; color: #2563eb; }
    .status-paid { background: #d1fae5; color: #059669; }
    .status-void { background: #fee2e2; color: #dc2626; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th { padding: 8px; text-align: left; border-bottom: 2px solid #333; font-size: 12px; text-transform: uppercase; }
    .totals td { padding: 6px 8px; }
    .total-row { font-weight: bold; font-size: 18px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="invoice-title">INVOICE</div>
      <div style="margin-top:8px">
        <span class="status status-${invoice.status}">${invoice.status}</span>
      </div>
    </div>
    <div style="text-align:right">
      <div style="font-weight:bold;font-size:18px">${orgName}</div>
    </div>
  </div>

  <div style="display:flex;justify-content:space-between;margin-bottom:30px">
    <div>
      <div class="meta-label">Bill To</div>
      <div style="font-weight:bold;margin-top:4px">${customer.name}</div>
      ${customer.email ? `<div>${customer.email}</div>` : ''}
      ${customer.address ? `<div>${customer.address}</div>` : ''}
      ${customer.taxId ? `<div>Tax ID: ${customer.taxId}</div>` : ''}
    </div>
    <div style="text-align:right">
      <div><span class="meta-label">Invoice #:</span> ${invoice.invoiceNumber}</div>
      <div><span class="meta-label">Date:</span> ${formatDate(invoice.createdAt)}</div>
      <div><span class="meta-label">Due Date:</span> ${formatDate(invoice.dueDate)}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th style="text-align:right">Qty</th>
        <th style="text-align:right">Unit Price</th>
        <th style="text-align:right">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${lineItemsHtml}
    </tbody>
  </table>

  <table class="totals" style="width:300px;margin-left:auto">
    <tr>
      <td>Subtotal</td>
      <td style="text-align:right">${formatCurrency(invoice.subtotal, invoice.currency)}</td>
    </tr>
    <tr>
      <td>Tax (${invoice.taxRate}%)</td>
      <td style="text-align:right">${formatCurrency(invoice.taxAmount, invoice.currency)}</td>
    </tr>
    <tr class="total-row" style="border-top:2px solid #333">
      <td style="padding-top:12px">Total</td>
      <td style="text-align:right;padding-top:12px">${formatCurrency(invoice.total, invoice.currency)}</td>
    </tr>
  </table>

  ${invoice.notes ? `<div style="margin-top:40px"><div class="meta-label">Notes</div><p>${invoice.notes}</p></div>` : ''}
</body>
</html>`;
}
