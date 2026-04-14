// @ts-nocheck
/**
 * Demo seed data — creates a default tenant, admin user, sample participants,
 * a published comp plan, quotas, goal sheets, and transactions.
 * Run with: pnpm --filter @opencomp/api db:seed
 */
import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { getDb, getPool } from './client'
import {
  tenants,
  users,
  participants,
  periods,
  plans,
  planVersions,
  components,
  quotas,
  goalSheets,
  sourceTransactions,
} from './schema'

async function seed() {
  const db = getDb()
  console.log('Seeding demo data...')

  // ── Tenant ──
  const [tenant] = await db
    .insert(tenants)
    .values({
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Acme Corp',
      slug: 'acme',
      settings: {},
    })
    .onConflictDoNothing()
    .returning()

  const tenantId = tenant?.id ?? '00000000-0000-0000-0000-000000000001'
  console.log(`  ✓ Tenant: ${tenantId}`)

  // ── Admin user ──
  const passwordHash = await bcrypt.hash('admin123', 10)
  const [adminUser] = await db
    .insert(users)
    .values({
      id: '00000000-0000-0000-0000-000000000002',
      tenantId,
      email: 'admin@acme.example',
      firstName: 'Admin',
      lastName: 'User',
      passwordHash,
      role: 'admin',
      isActive: true,
    })
    .onConflictDoNothing()
    .returning()
  console.log(`  ✓ Admin user: ${adminUser?.email ?? 'already exists'}`)

  // ── Comp manager ──
  const [manager] = await db
    .insert(users)
    .values({
      id: '00000000-0000-0000-0000-000000000003',
      tenantId,
      email: 'manager@acme.example',
      firstName: 'Comp',
      lastName: 'Manager',
      passwordHash: await bcrypt.hash('manager123', 10),
      role: 'comp_manager',
      isActive: true,
    })
    .onConflictDoNothing()
    .returning()
  console.log(`  ✓ Comp manager: ${manager?.email ?? 'already exists'}`)

  // ── Rep users + linked participants ──
  const repPassword = await bcrypt.hash('rep123', 10)

  const reps = [
    {
      userId: '00000000-0000-0000-0000-000000000010',
      participantId: '00000000-0000-0000-0000-000000000011',
      firstName: 'Demo',
      lastName: 'Rep',
      email: 'rep@acme.example',
      title: 'Account Executive',
    },
    {
      userId: '00000000-0000-0000-0000-000000000020',
      participantId: '00000000-0000-0000-0000-000000000021',
      firstName: 'Alice',
      lastName: 'Chen',
      email: 'alice.chen@acme.example',
      title: 'Account Executive',
    },
    {
      userId: '00000000-0000-0000-0000-000000000030',
      participantId: '00000000-0000-0000-0000-000000000031',
      firstName: 'Bob',
      lastName: 'Smith',
      email: 'bob.smith@acme.example',
      title: 'Senior AE',
    },
    {
      userId: '00000000-0000-0000-0000-000000000040',
      participantId: '00000000-0000-0000-0000-000000000041',
      firstName: 'Carol',
      lastName: 'Davis',
      email: 'carol.davis@acme.example',
      title: 'SDR',
    },
  ]

  for (const rep of reps) {
    await db
      .insert(users)
      .values({
        id: rep.userId,
        tenantId,
        email: rep.email,
        firstName: rep.firstName,
        lastName: rep.lastName,
        passwordHash: repPassword,
        role: 'rep',
        isActive: true,
      })
      .onConflictDoNothing()

    await db
      .insert(participants)
      .values({
        id: rep.participantId,
        tenantId,
        userId: rep.userId,
        firstName: rep.firstName,
        lastName: rep.lastName,
        email: rep.email,
        title: rep.title,
        status: 'active',
        metadata: {},
      })
      .onConflictDoNothing()

    console.log(`  ✓ Rep: ${rep.email} → participant ${rep.participantId}`)
  }

  // ── Period ──
  const periodId = '00000000-0000-0000-0000-000000000099'
  await db
    .insert(periods)
    .values({
      id: periodId,
      tenantId,
      name: 'Q1 2026',
      startDate: '2026-01-01',
      endDate: '2026-03-31',
      isClosed: false,
    })
    .onConflictDoNothing()
  console.log(`  ✓ Period: Q1 2026 (${periodId})`)

  // ── Plan ──
  const planId = '00000000-0000-0000-0000-000000000100'
  await db
    .insert(plans)
    .values({
      id: planId,
      tenantId,
      name: 'Q1 2026 Enterprise AE Plan',
      description: 'Accelerated commission plan for Enterprise Account Executives targeting $500K+ deals.',
      status: 'published',
      effectiveFrom: '2026-01-01',
      effectiveTo: '2026-03-31',
      currency: 'USD',
      metadata: {},
    })
    .onConflictDoNothing()
  console.log(`  ✓ Plan: Q1 2026 Enterprise AE Plan (${planId})`)

  // ── Plan version ──
  const planVersionId = '00000000-0000-0000-0000-000000000101'
  const adminUserId = '00000000-0000-0000-0000-000000000002'
  await db
    .insert(planVersions)
    .values({
      id: planVersionId,
      tenantId,
      planId,
      version: 1,
      status: 'approved',
      definition: {
        accelerators: [
          { threshold: 1.0, multiplier: 1.0 },
          { threshold: 1.25, multiplier: 1.5 },
          { threshold: 1.5, multiplier: 2.0 },
        ],
        baseCommissionRate: 0.08,
        currency: 'USD',
      },
      publishedAt: new Date('2025-12-15T10:00:00Z'),
      publishedById: adminUserId,
    })
    .onConflictDoNothing()
  console.log(`  ✓ Plan version v1 (${planVersionId})`)

  // ── Components ──
  const comp1Id = '00000000-0000-0000-0000-000000000110'
  const comp2Id = '00000000-0000-0000-0000-000000000111'

  await db
    .insert(components)
    .values([
      {
        id: comp1Id,
        tenantId,
        planVersionId,
        name: 'New Business Revenue',
        type: 'commission',
        measureType: 'revenue',
        formulaId: 'accelerated-commission',
        config: { baseRate: 0.08, currency: 'USD' },
        sortOrder: 0,
      },
      {
        id: comp2Id,
        tenantId,
        planVersionId,
        name: 'Pipeline Development',
        type: 'bonus',
        measureType: 'activity',
        formulaId: 'mbo-bonus',
        config: { targetBonus: 1000000, currency: 'USD' },
        sortOrder: 1,
      },
    ])
    .onConflictDoNothing()
  console.log('  ✓ Components: New Business Revenue + Pipeline Development')

  // ── Quotas per rep ──
  const repQuotas: { participantId: string; revenueCents: number; pipelineCents: number }[] = [
    { participantId: '00000000-0000-0000-0000-000000000011', revenueCents: 50000000, pipelineCents: 15000000 },
    { participantId: '00000000-0000-0000-0000-000000000021', revenueCents: 50000000, pipelineCents: 15000000 },
    { participantId: '00000000-0000-0000-0000-000000000031', revenueCents: 75000000, pipelineCents: 20000000 },
    { participantId: '00000000-0000-0000-0000-000000000041', revenueCents: 20000000, pipelineCents: 8000000 },
  ]

  for (const rq of repQuotas) {
    await db
      .insert(quotas)
      .values([
        {
          tenantId,
          participantId: rq.participantId,
          planVersionId,
          periodId,
          type: 'revenue',
          amount: rq.revenueCents,
          currency: 'USD',
          notes: 'New business revenue quota for Q1 2026',
        },
        {
          tenantId,
          participantId: rq.participantId,
          planVersionId,
          periodId,
          type: 'activity',
          amount: rq.pipelineCents,
          currency: 'USD',
          notes: 'Pipeline development quota for Q1 2026',
        },
      ])
      .onConflictDoNothing()
  }
  console.log('  ✓ Quotas seeded for all 4 reps')

  // ── Goal sheets (distributed) ──
  const goalSheetTargets = (revenueCents: number, pipelineCents: number) => ({
    targets: [
      { componentName: 'New Business Revenue', quotaAmountCents: revenueCents, currency: 'USD' },
      { componentName: 'Pipeline Development', quotaAmountCents: pipelineCents, currency: 'USD' },
    ],
  })

  const goalSheetRows = [
    {
      participantId: '00000000-0000-0000-0000-000000000011',
      data: goalSheetTargets(50000000, 15000000),
    },
    {
      participantId: '00000000-0000-0000-0000-000000000021',
      data: goalSheetTargets(50000000, 15000000),
    },
    {
      participantId: '00000000-0000-0000-0000-000000000031',
      data: goalSheetTargets(75000000, 20000000),
    },
    {
      participantId: '00000000-0000-0000-0000-000000000041',
      data: goalSheetTargets(20000000, 8000000),
    },
  ]

  for (const gs of goalSheetRows) {
    await db
      .insert(goalSheets)
      .values({
        tenantId,
        participantId: gs.participantId,
        planVersionId,
        periodId,
        status: 'distributed',
        distributedAt: new Date('2026-01-02T09:00:00Z'),
        data: gs.data,
      })
      .onConflictDoNothing()
  }
  console.log('  ✓ Goal sheets seeded (distributed) for all 4 reps')

  // ── Transactions (3 per rep, validated) ──
  const txData: { participantId: string; amounts: number[]; dates: string[] }[] = [
    {
      participantId: '00000000-0000-0000-0000-000000000011',
      amounts: [12500000, 8750000, 22000000],
      dates: ['2026-01-15', '2026-02-03', '2026-03-12'],
    },
    {
      participantId: '00000000-0000-0000-0000-000000000021',
      amounts: [9800000, 16500000, 11200000],
      dates: ['2026-01-22', '2026-02-14', '2026-03-08'],
    },
    {
      participantId: '00000000-0000-0000-0000-000000000031',
      amounts: [21000000, 18750000, 30500000],
      dates: ['2026-01-10', '2026-02-21', '2026-03-20'],
    },
    {
      participantId: '00000000-0000-0000-0000-000000000041',
      amounts: [5200000, 3800000, 7100000],
      dates: ['2026-01-28', '2026-02-18', '2026-03-25'],
    },
  ]

  let txIndex = 1
  for (const rep of txData) {
    for (let i = 0; i < rep.amounts.length; i++) {
      const externalId = `DEAL-2026-Q1-${String(txIndex).padStart(4, '0')}`
      await db
        .insert(sourceTransactions)
        .values({
          tenantId,
          externalId,
          source: 'salesforce',
          participantId: rep.participantId,
          transactionDate: rep.dates[i],
          amountCents: rep.amounts[i],
          currency: 'USD',
          status: 'validated',
          payload: {
            dealName: `Enterprise Deal ${externalId}`,
            closeDate: rep.dates[i],
            stage: 'Closed Won',
          },
          processedAt: new Date(`${rep.dates[i]}T18:00:00Z`),
        })
        .onConflictDoNothing()
      txIndex++
    }
  }
  console.log('  ✓ Transactions seeded (3 validated per rep, 12 total)')

  console.log('\nSeed complete! Login credentials:')
  console.log('  Admin:   admin@acme.example / admin123')
  console.log('  Manager: manager@acme.example / manager123')
  console.log('  Rep:     rep@acme.example / rep123 (also alice/bob/carol with same password)')
  console.log('  Tenant:  X-Tenant-Id: 00000000-0000-0000-0000-000000000001')
  console.log('  Period:  00000000-0000-0000-0000-000000000099 (Q1 2026)')
  console.log('  Plan:    00000000-0000-0000-0000-000000000100 (published)')
  console.log('  Version: 00000000-0000-0000-0000-000000000101 (approved, v1)')

  await getPool().end()
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
