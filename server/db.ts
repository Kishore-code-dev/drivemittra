import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { buildSeedDataset, type EnvironmentDataset } from '../src/data/seedOrganizations.ts'
import type { Organization, OrganizationRole, OrganizationStatus } from '../src/types/fleet.ts'
import { hashPassword } from './authLogic.ts'

const DATA_DIR = path.resolve(process.cwd(), '.drivemitra-data')
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads')
const DB_PATH = path.join(DATA_DIR, 'drivemitra.db')

export interface DbUserRow {
  id: string
  username: string
  email: string
  fullName: string
  passwordHash: string
  role: OrganizationRole
  organizationId: string | null
  passwordChangeRequired: boolean
  status: 'active' | 'suspended'
  createdAt: string
  lastLoginAt: string | null
}

export interface PlatformAuditLogRow {
  id: string
  actorUserId: string
  actorUsername: string
  action: string
  targetOrgId: string | null
  targetOrgName: string | null
  reason: string
  metadataJson: string
  createdAt: string
}

let dbInstance: DatabaseSync | null = null

export function getUploadsDir(): string {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true })
  return UPLOADS_DIR
}

export function getDb(): DatabaseSync {
  if (dbInstance) return dbInstance
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.mkdirSync(UPLOADS_DIR, { recursive: true })

  const db = new DatabaseSync(DB_PATH)
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT NOT NULL,
      full_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      organization_id TEXT,
      password_change_required INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      organization_id TEXT,
      token_hash TEXT UNIQUE NOT NULL,
      revoked INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT UNIQUE NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      timezone TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      vehicle_limit INTEGER NOT NULL,
      driver_limit INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      payment_status TEXT NOT NULL DEFAULT 'paid',
      subscription_start_date TEXT NOT NULL,
      subscription_expiry_date TEXT NOT NULL,
      grace_period_until TEXT,
      suspension_reason TEXT,
      owner_name TEXT,
      owner_email TEXT,
      owner_phone TEXT,
      gstin TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS org_fleet_blobs (
      organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS platform_admin_audit_logs (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT NOT NULL,
      actor_username TEXT NOT NULL,
      action TEXT NOT NULL,
      target_org_id TEXT,
      target_org_name TEXT,
      reason TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS document_files (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      storage_key TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size_bytes INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
  `)

  seedDatabaseIfEmpty(db)
  dbInstance = db
  return db
}

export function createEmptyOrgDataset(org: Organization): Omit<EnvironmentDataset, 'organizations' | 'members'> {
  return {
    vehicles: [],
    drivers: [],
    driverEvents: [],
    driverAssignments: [],
    trips: [],
    fuelTransactions: [],
    maintenanceRecords: [],
    inspections: [],
    serviceSchedules: [],
    smallIssues: [],
    places: [],
    workOrders: [],
    partsInventory: [],
    suppliers: [],
    purchaseOrders: [],
    inventoryTransactions: [],
    workshops: [],
    invoices: [],
    payments: [],
    documentVault: [],
    tyrePositions: [],
    alerts: [],
    auditLogs: [
      {
        id: `aud-init-${org.id}`,
        organizationId: org.id,
        environment: 'production',
        actorName: 'Platform Administration',
        actorRole: 'platform_admin',
        action: 'ORG_PROVISIONED',
        entityType: 'organization',
        entityId: org.id,
        summary: `Provisioned production workspace for ${org.name} (${org.code}).`,
        timestamp: org.createdAt,
      },
    ],
    reports: [],
  }
}

function seedDatabaseIfEmpty(db: DatabaseSync) {
  const existingUsers = db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number }
  if (existingUsers.count > 0) return

  const seed = buildSeedDataset('production')
  const nowIso = new Date().toISOString()

  const insertOrg = db.prepare(`
    INSERT INTO organizations (
      id, name, code, city, state, timezone, plan_id, vehicle_limit, driver_limit,
      status, payment_status, subscription_start_date, subscription_expiry_date,
      grace_period_until, suspension_reason, owner_name, owner_email, owner_phone, gstin, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const insertBlob = db.prepare(`
    INSERT INTO org_fleet_blobs (organization_id, payload_json, updated_at) VALUES (?, ?, ?)
  `)

  for (const org of seed.organizations) {
    insertOrg.run(
      org.id,
      org.name,
      org.code,
      org.city,
      org.state,
      org.timezone,
      org.planId,
      org.vehicleLimit,
      org.driverLimit,
      org.status,
      org.paymentStatus,
      org.subscriptionStartDate,
      org.subscriptionExpiryDate,
      org.gracePeriodUntil ?? null,
      org.suspensionReason ?? null,
      org.ownerName ?? null,
      org.ownerEmail ?? null,
      org.ownerPhone ?? null,
      org.gstin ?? null,
      org.createdAt,
    )

    const orgScoped = {
      vehicles: seed.vehicles.filter((v) => v.organizationId === org.id),
      drivers: seed.drivers.filter((d) => d.organizationId === org.id),
      driverEvents: seed.driverEvents.filter((e) => e.organizationId === org.id),
      driverAssignments: seed.driverAssignments.filter((a) => a.organizationId === org.id),
      trips: seed.trips.filter((t) => t.organizationId === org.id),
      fuelTransactions: seed.fuelTransactions.filter((f) => f.organizationId === org.id),
      maintenanceRecords: seed.maintenanceRecords.filter((m) => m.organizationId === org.id),
      inspections: seed.inspections.filter((i) => i.organizationId === org.id),
      serviceSchedules: seed.serviceSchedules.filter((s) => s.organizationId === org.id),
      smallIssues: seed.smallIssues.filter((i) => i.organizationId === org.id),
      places: seed.places.filter((pl) => pl.organizationId === org.id),
      workOrders: seed.workOrders.filter((w) => w.organizationId === org.id),
      partsInventory: seed.partsInventory.filter((p) => p.organizationId === org.id),
      suppliers: seed.suppliers.filter((s) => s.organizationId === org.id),
      purchaseOrders: seed.purchaseOrders.filter((p) => p.organizationId === org.id),
      inventoryTransactions: seed.inventoryTransactions.filter((tx) => tx.organizationId === org.id),
      workshops: seed.workshops.filter((w) => w.organizationId === org.id),
      invoices: seed.invoices.filter((inv) => inv.organizationId === org.id),
      payments: seed.payments.filter((p) => p.organizationId === org.id),
      documentVault: seed.documentVault.filter((doc) => doc.organizationId === org.id),
      tyrePositions: seed.tyrePositions.filter((t) =>
        seed.vehicles.some((v) => v.id === t.vehicleId && v.organizationId === org.id),
      ),
      alerts: seed.alerts.filter((a) => a.organizationId === org.id),
      auditLogs: seed.auditLogs.filter((a) => a.organizationId === org.id),
      reports: seed.reports.filter((r) => r.organizationId === org.id),
      members: seed.members.filter((m) => m.organizationId === org.id),
    }

    insertBlob.run(org.id, JSON.stringify(orgScoped), nowIso)
  }

  // Provision Southern Freight Lines (new tenant awaiting first login password update)
  const southernOrg: Organization = {
    id: 'org-southern',
    name: 'Southern Freight Corridor LLP',
    code: 'STH-KL',
    city: 'Kochi',
    state: 'Kerala',
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    planId: 'starter',
    vehicleLimit: 15,
    driverLimit: 25,
    status: 'payment_pending',
    paymentStatus: 'pending',
    subscriptionStartDate: nowIso.slice(0, 10),
    subscriptionExpiryDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    ownerName: 'Aravind Menon',
    ownerEmail: 'aravind@southernfreight.in',
    ownerPhone: '+91 98950 33112',
    gstin: '32AABCS9910E1Z1',
    createdAt: nowIso,
    environment: 'production',
  }

  insertOrg.run(
    southernOrg.id,
    southernOrg.name,
    southernOrg.code,
    southernOrg.city,
    southernOrg.state,
    southernOrg.timezone,
    southernOrg.planId,
    southernOrg.vehicleLimit,
    southernOrg.driverLimit,
    southernOrg.status,
    southernOrg.paymentStatus,
    southernOrg.subscriptionStartDate,
    southernOrg.subscriptionExpiryDate,
    null,
    null,
    southernOrg.ownerName ?? null,
    southernOrg.ownerEmail ?? null,
    southernOrg.ownerPhone ?? null,
    southernOrg.gstin ?? null,
    southernOrg.createdAt,
  )
  insertBlob.run(
    southernOrg.id,
    JSON.stringify({
      ...createEmptyOrgDataset(southernOrg),
      members: [
        {
          id: 'mem-sth-1',
          organizationId: southernOrg.id,
          userId: 'u-sth-1',
          username: 'southern.owner',
          fullName: 'Aravind Menon',
          email: 'aravind@southernfreight.in',
          role: 'org_admin',
          status: 'active',
          lastActiveAt: nowIso,
        },
      ],
    }),
    nowIso,
  )

  const insertUser = db.prepare(`
    INSERT INTO users (
      id, username, email, full_name, password_hash, role, organization_id,
      password_change_required, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const defaultOwnerPass = process.env.SEED_OWNER_PASSWORD || 'DriveMitra@2026'
  const defaultAdminPass = process.env.SEED_SUPERADMIN_PASSWORD || 'PlatformAdmin@2026'
  const defaultTempPass = process.env.SEED_FIRSTLOGIN_TEMP_PASSWORD || 'WelcomeTmp#2026'

  const initialUsers: Array<{
    id: string
    username: string
    email: string
    fullName: string
    password: string
    role: OrganizationRole
    orgId: string | null
    pwdChangeReq: number
  }> = [
    {
      id: 'u-platform-admin',
      username: 'superadmin',
      email: 'governance@drivemitra.in',
      fullName: 'DriveMitra Platform Governance',
      password: defaultAdminPass,
      role: 'platform_admin',
      orgId: null,
      pwdChangeReq: 0,
    },
    {
      id: 'u-k1',
      username: 'kaveri.owner',
      email: 'karthikeyan@kaverilogistics.in',
      fullName: 'Karthikeyan R',
      password: defaultOwnerPass,
      role: 'org_admin',
      orgId: 'org-kaveri',
      pwdChangeReq: 0,
    },
    {
      id: 'u-k2',
      username: 'kaveri.manager',
      email: 'priya@kaverilogistics.in',
      fullName: 'Priya Sundar',
      password: defaultOwnerPass,
      role: 'fleet_manager',
      orgId: 'org-kaveri',
      pwdChangeReq: 0,
    },
    {
      id: 'u-k3',
      username: 'kaveri.maint',
      email: 'senthil@kaverilogistics.in',
      fullName: 'Senthil Murugan',
      password: defaultOwnerPass,
      role: 'maintenance',
      orgId: 'org-kaveri',
      pwdChangeReq: 0,
    },
    {
      id: 'u-k4',
      username: 'kaveri.finance',
      email: 'finance@kaverilogistics.in',
      fullName: 'Lakshmi Narayanan',
      password: defaultOwnerPass,
      role: 'finance',
      orgId: 'org-kaveri',
      pwdChangeReq: 0,
    },
    {
      id: 'u-d1',
      username: 'deccan.owner',
      email: 'nandini@deccanev.in',
      fullName: 'Nandini Rao',
      password: defaultOwnerPass,
      role: 'org_admin',
      orgId: 'org-deccan',
      pwdChangeReq: 0,
    },
    {
      id: 'u-sth-1',
      username: 'southern.owner',
      email: 'aravind@southernfreight.in',
      fullName: 'Aravind Menon',
      password: defaultTempPass,
      role: 'org_admin',
      orgId: 'org-southern',
      pwdChangeReq: 1,
    },
  ]

  for (const u of initialUsers) {
    insertUser.run(
      u.id,
      u.username,
      u.email,
      u.fullName,
      hashPassword(u.password),
      u.role,
      u.orgId,
      u.pwdChangeReq,
      'active',
      nowIso,
    )
  }

  db.prepare(`
    INSERT INTO platform_admin_audit_logs (
      id, actor_user_id, actor_username, action, target_org_id, target_org_name, reason, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'paud-init-1',
    'u-platform-admin',
    'superadmin',
    'ONBOARD_ORGANIZATION',
    'org-southern',
    'Southern Freight Corridor LLP',
    'Initial commercial fleet onboarding with mandatory first-login credential rotation',
    JSON.stringify({ planId: 'starter', ownerUsername: 'southern.owner' }),
    nowIso,
  )
}

export function mapUserRow(row: Record<string, unknown>): DbUserRow {
  return {
    id: String(row.id),
    username: String(row.username),
    email: String(row.email),
    fullName: String(row.full_name),
    passwordHash: String(row.password_hash),
    role: String(row.role) as OrganizationRole,
    organizationId: row.organization_id ? String(row.organization_id) : null,
    passwordChangeRequired: Number(row.password_change_required) === 1,
    status: String(row.status) as 'active' | 'suspended',
    createdAt: String(row.created_at),
    lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
  }
}

export function mapOrgRow(row: Record<string, unknown>): Organization {
  return {
    id: String(row.id),
    name: String(row.name),
    code: String(row.code),
    city: String(row.city),
    state: String(row.state),
    timezone: String(row.timezone),
    currency: 'INR',
    planId: String(row.plan_id) as Organization['planId'],
    vehicleLimit: Number(row.vehicle_limit),
    driverLimit: Number(row.driver_limit),
    status: String(row.status) as OrganizationStatus,
    paymentStatus: String(row.payment_status) as Organization['paymentStatus'],
    subscriptionStartDate: String(row.subscription_start_date),
    subscriptionExpiryDate: String(row.subscription_expiry_date),
    gracePeriodUntil: row.grace_period_until ? String(row.grace_period_until) : undefined,
    suspensionReason: row.suspension_reason ? String(row.suspension_reason) : undefined,
    ownerName: row.owner_name ? String(row.owner_name) : undefined,
    ownerEmail: row.owner_email ? String(row.owner_email) : undefined,
    ownerPhone: row.owner_phone ? String(row.owner_phone) : undefined,
    gstin: row.gstin ? String(row.gstin) : undefined,
    createdAt: String(row.created_at),
    environment: 'production',
  }
}
