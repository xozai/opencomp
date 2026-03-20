/**
 * Demo seed data — creates a default tenant, admin user, and sample participants.
 * Run with: pnpm --filter @opencomp/api db:seed
 */
import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { getDb, getPool } from './client'
import { tenants, users, participants, periods } from './schema'

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

  // ── Participants ──
  const sampleReps = [
    { firstName: 'Alice', lastName: 'Chen', email: 'alice.chen@acme.example', title: 'Account Executive' },
    { firstName: 'Bob', lastName: 'Smith', email: 'bob.smith@acme.example', title: 'Senior AE' },
    { firstName: 'Carol', lastName: 'Davis', email: 'carol.davis@acme.example', title: 'SDR' },
  ]

  for (const rep of sampleReps) {
    await db
      .insert(participants)
      .values({
        tenantId,
        ...rep,
        status: 'active',
        metadata: {},
      })
      .onConflictDoNothing()
    console.log(`  ✓ Participant: ${rep.firstName} ${rep.lastName}`)
  }

  // ── Period ──
  await db
    .insert(periods)
    .values({
      tenantId,
      name: 'Q1 2026',
      startDate: '2026-01-01',
      endDate: '2026-03-31',
      isClosed: false,
    })
    .onConflictDoNothing()
  console.log('  ✓ Period: Q1 2026')

  console.log('\nSeed complete! Login credentials:')
  console.log('  Admin:   admin@acme.example / admin123')
  console.log('  Manager: manager@acme.example / manager123')
  console.log('  Tenant:  X-Tenant-Id: 00000000-0000-0000-0000-000000000001')

  await getPool().end()
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
