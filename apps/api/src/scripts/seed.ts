/**
 * DXER Seed Script
 * Creates demo data for all flows.
 * Run: npx tsx src/scripts/seed.ts
 */
import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';

const prisma = new PrismaClient();
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function main() {
  console.log('🌱 Seeding DXER database...\n');

  // ─── Create Users ──────────────────────────────
  console.log('Creating users...');
  const users = [
    { email: 'owner@dxer.demo', password: 'password123', fullName: 'Alice Owner' },
    { email: 'admin@dxer.demo', password: 'password123', fullName: 'Bob Admin' },
    { email: 'accountant@dxer.demo', password: 'password123', fullName: 'Carol Accountant' },
    { email: 'viewer@dxer.demo', password: 'password123', fullName: 'Dave Viewer' },
  ];

  const createdUsers: { id: string; email: string }[] = [];

  for (const user of users) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: { full_name: user.fullName },
    });

    if (error) {
      // User might already exist
      const { data: existingUsers } = await supabase.auth.admin.listUsers();
      const existing = existingUsers?.users?.find((u) => u.email === user.email);
      if (existing) {
        createdUsers.push({ id: existing.id, email: existing.email! });
        console.log(`  ✓ User ${user.email} already exists`);
        continue;
      }
      console.error(`  ✗ Failed to create ${user.email}: ${error.message}`);
      continue;
    }

    createdUsers.push({ id: data.user.id, email: data.user.email! });
    console.log(`  ✓ Created ${user.email}`);
  }

  if (createdUsers.length < 4) {
    console.error('Need at least 4 users. Aborting seed.');
    return;
  }

  const [ownerId, adminId, accountantId, viewerId] = createdUsers.map((u) => u.id);

  // ─── Create Organization ───────────────────────
  console.log('\nCreating organization...');
  const org = await prisma.organizations.upsert({
    where: { slug: 'dxer-demo' },
    create: {
      name: 'DXER Demo Corp',
      slug: 'dxer-demo',
      owner_id: ownerId,
    },
    update: {},
  });
  console.log(`  ✓ Organization: ${org.name} (${org.id})`);

  // ─── Add Members ───────────────────────────────
  console.log('\nAdding members...');
  const memberData = [
    { user_id: ownerId, role: 'owner' },
    { user_id: adminId, role: 'admin' },
    { user_id: accountantId, role: 'accountant' },
    { user_id: viewerId, role: 'viewer' },
  ];

  for (const m of memberData) {
    await prisma.organization_members.upsert({
      where: { org_id_user_id: { org_id: org.id, user_id: m.user_id } },
      create: { org_id: org.id, ...m },
      update: {},
    });
    console.log(`  ✓ Added ${m.role}`);
  }

  // ─── Create Customers ──────────────────────────
  console.log('\nCreating customers...');
  const customer1 = await prisma.customers.create({
    data: {
      org_id: org.id,
      name: 'Acme Corporation',
      email: 'billing@acme.example',
      phone: '+1-555-0100',
      address: '123 Main St, Springfield, IL 62701',
      tax_id: 'US-123456789',
    },
  });
  const customer2 = await prisma.customers.create({
    data: {
      org_id: org.id,
      name: 'Globex Industries',
      email: 'finance@globex.example',
      address: '456 Oak Ave, Shelbyville, IL 62565',
    },
  });
  console.log(`  ✓ Created 2 customers`);

  // ─── Create Employees ──────────────────────────
  console.log('\nCreating employees...');
  const employees = await Promise.all([
    prisma.employees.create({
      data: {
        org_id: org.id, full_name: 'John Smith', email: 'john@dxer.demo',
        position: 'Senior Developer', department: 'Engineering',
        salary: 8500, currency: 'USD', start_date: new Date('2024-01-15'),
      },
    }),
    prisma.employees.create({
      data: {
        org_id: org.id, full_name: 'Jane Doe', email: 'jane@dxer.demo',
        position: 'Product Manager', department: 'Product',
        salary: 9000, currency: 'USD', start_date: new Date('2024-03-01'),
      },
    }),
    prisma.employees.create({
      data: {
        org_id: org.id, full_name: 'Mike Johnson', email: 'mike@dxer.demo',
        position: 'Designer', department: 'Design',
        salary: 7500, currency: 'USD', start_date: new Date('2024-06-15'),
      },
    }),
  ]);
  console.log(`  ✓ Created ${employees.length} employees`);

  // ─── Create Expenses ───────────────────────────
  console.log('\nCreating expenses...');
  const expenseData = [
    { description: 'Office supplies - pens and notebooks', amount: 45.99, category: 'supplies', date: '2025-01-15', tags: ['office'] },
    { description: 'Client lunch meeting', amount: 125.50, category: 'meals', date: '2025-01-20', tags: ['client', 'sales'] },
    { description: 'Flight to NYC for conference', amount: 450.00, category: 'travel', date: '2025-02-01', tags: ['conference'] },
    { description: 'AWS cloud hosting', amount: 299.99, category: 'software', date: '2025-02-05', tags: ['infrastructure'] },
    { description: 'Marketing campaign - Google Ads', amount: 1500.00, category: 'marketing', date: '2025-02-10', tags: ['ads', 'q1'] },
  ];

  for (const exp of expenseData) {
    await prisma.expenses.create({
      data: {
        org_id: org.id,
        created_by: accountantId,
        description: exp.description,
        amount: exp.amount,
        currency: 'USD',
        category: exp.category,
        date: new Date(exp.date),
        tags: exp.tags,
      },
    });
  }
  console.log(`  ✓ Created ${expenseData.length} expenses`);

  // ─── Create Invoice Sequence ───────────────────
  await prisma.dxer_sequences.upsert({
    where: { org_id_seq_name: { org_id: org.id, seq_name: 'invoice' } },
    create: { org_id: org.id, seq_name: 'invoice', current_val: 2 },
    update: {},
  });

  // ─── Create Invoices ───────────────────────────
  console.log('\nCreating invoices...');
  const inv1 = await prisma.invoices.create({
    data: {
      org_id: org.id,
      created_by: accountantId,
      customer_id: customer1.id,
      invoice_number: 'INV-000001',
      due_date: new Date('2025-03-15'),
      subtotal: 5000,
      tax_rate: 10,
      tax_amount: 500,
      total: 5500,
      notes: 'Q1 consulting services',
      line_items: {
        create: [
          { description: 'Consulting - January', quantity: 40, unit_price: 75, amount: 3000 },
          { description: 'Consulting - February', quantity: 26.67, unit_price: 75, amount: 2000 },
        ],
      },
    },
  });

  const inv2 = await prisma.invoices.create({
    data: {
      org_id: org.id,
      created_by: accountantId,
      customer_id: customer2.id,
      invoice_number: 'INV-000002',
      status: 'sent',
      due_date: new Date('2025-04-01'),
      subtotal: 12000,
      tax_rate: 8.5,
      tax_amount: 1020,
      total: 13020,
      line_items: {
        create: [
          { description: 'Software Development - Sprint 1', quantity: 1, unit_price: 6000, amount: 6000 },
          { description: 'Software Development - Sprint 2', quantity: 1, unit_price: 6000, amount: 6000 },
        ],
      },
    },
  });
  console.log(`  ✓ Created 2 invoices`);

  // ─── Create Payroll ────────────────────────────
  console.log('\nCreating payroll...');
  const totalPayroll = employees.reduce((sum, e) => sum + Number(e.salary), 0);
  const payroll = await prisma.payrolls.create({
    data: {
      org_id: org.id,
      created_by: adminId,
      period_start: new Date('2025-01-01'),
      period_end: new Date('2025-01-31'),
      pay_date: new Date('2025-02-01'),
      total_amount: totalPayroll,
      status: 'completed',
      entries: {
        create: employees.map((emp) => ({
          employee_id: emp.id,
          amount: Number(emp.salary),
        })),
      },
    },
  });
  console.log(`  ✓ Created payroll: $${totalPayroll}`);

  // ─── Create Production Batch + Events ──────────
  console.log('\nCreating production batch...');
  const batch = await prisma.production_batches.create({
    data: {
      org_id: org.id,
      created_by: accountantId,
      name: 'Batch #2025-Q1-001',
      description: 'First quarter production run',
      status: 'in_progress',
      planned_start_date: new Date('2025-01-10'),
      planned_end_date: new Date('2025-03-31'),
      actual_start_date: new Date('2025-01-12'),
    },
  });

  const eventData = [
    { type: 'batch_started', desc: 'Production batch initiated' },
    { type: 'quality_check', desc: 'Initial quality check passed' },
    { type: 'milestone', desc: 'Phase 1 completed - 40% done' },
    { type: 'issue_reported', desc: 'Minor calibration issue found and resolved' },
    { type: 'quality_check', desc: 'Mid-production quality check passed' },
  ];

  for (const evt of eventData) {
    await prisma.production_events.create({
      data: {
        org_id: org.id,
        batch_id: batch.id,
        created_by: accountantId,
        event_type: evt.type,
        description: evt.desc,
        metadata: { automated: false },
      },
    });
  }
  console.log(`  ✓ Created batch with ${eventData.length} events`);

  // ─── Create Audit Log Entries ──────────────────
  console.log('\nCreating audit log entries...');
  const auditEntries = [
    { action: 'create', entity_type: 'organization', entity_id: org.id, after_data: { name: org.name } },
    { action: 'create', entity_type: 'expense', entity_id: 'demo', after_data: { description: 'Office supplies' } },
    { action: 'create', entity_type: 'invoice', entity_id: inv1.id, after_data: { invoiceNumber: 'INV-000001' } },
    { action: 'status_change', entity_type: 'invoice', entity_id: inv2.id, before_data: { status: 'draft' }, after_data: { status: 'sent' } },
    { action: 'create', entity_type: 'payroll', entity_id: payroll.id, after_data: { totalAmount: totalPayroll } },
    { action: 'create', entity_type: 'production_batch', entity_id: batch.id, after_data: { name: batch.name } },
  ];

  for (const entry of auditEntries) {
    await prisma.audit_log.create({
      data: {
        org_id: org.id,
        user_id: ownerId,
        action: entry.action,
        entity_type: entry.entity_type,
        entity_id: entry.entity_id === 'demo' ? org.id : entry.entity_id,
        before_data: (entry as any).before_data,
        after_data: entry.after_data,
      },
    });
  }
  console.log(`  ✓ Created ${auditEntries.length} audit entries`);

  console.log('\n✅ Seed complete!\n');
  console.log('Demo Credentials:');
  console.log('  Owner:      owner@dxer.demo / password123');
  console.log('  Admin:      admin@dxer.demo / password123');
  console.log('  Accountant: accountant@dxer.demo / password123');
  console.log('  Viewer:     viewer@dxer.demo / password123');
  console.log(`\nOrganization: ${org.name} (ID: ${org.id})`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
