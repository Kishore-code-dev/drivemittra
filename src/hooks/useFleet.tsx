import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AIPrediction,
  AuditLogEntry,
  ComponentCategory,
  DocumentVaultItem,
  Driver,
  DriverAssignmentHistoryItem,
  DriverBehaviorEvent,
  DriverOperationalStatus,
  FinancialInvoice,
  FiveAreaHealthCategory,
  FuelTransaction,
  InventoryTransaction,
  MaintenanceRecord,
  OperatingEnvironment,
  OperationalAlert,
  Organization,
  OrganizationMember,
  OrganizationRole,
  PartInventoryItem,
  PaymentRecord,
  PurchaseOrder,
  RefreshStatus,
  RegionalCorridor,
  ReportHistoryItem,
  ReportingPeriod,
  RiskAssessmentItem,
  ServiceScheduleReminder,
  SmallIssueLog,
  PlaceRecord,
  SubscriptionPlanId,
  SupplierRecord,
  Trip,
  TyrePositionRecord,
  Vehicle,
  VehicleInspection,
  WorkOrder,
  WorkOrderStatus,
  WorkshopVendor,
} from '../types/fleet'
import {
  buildSeedDataset,
  EnvironmentDataset,
  REGIONAL_CORRIDORS,
  SUBSCRIPTION_PLANS,
} from '../data/seedOrganizations'
import {
  analyzeFuelTransactions,
  buildFleetRiskAssessments,
  computeFinancialIntelligence,
  computeFinancialLedgerSummary,
  evaluateDriverSafety,
  generateFleetPredictions,
  isStaleOutOfOrderTimestamp,
  isValidCoordinate,
  normalizeRegistrationNumber,
  validateFuelTransactionInput,
  validateVehiclePayload,
} from '../utils/intelligenceEngine'
import { assertRolePermission } from '../utils/rbac'
import { getCorridorSeedLocation } from '../utils/fleetTracking'
import { useAuth } from './useAuth'

const SETTINGS_KEY = 'dm_workspace_settings_v3'

export interface WorkspaceSettings {
  aiConfidenceThreshold: number
  telemetryIntervalSec: number
  lowHealthAlertCutoff: number
  speedCeilingKmh: number
  emailDigestEnabled: boolean
  criticalPushEnabled: boolean
  maintenanceReminderDays: number
  digilockerEnabled: boolean
}

const DEFAULT_SETTINGS: WorkspaceSettings = {
  aiConfidenceThreshold: 75,
  telemetryIntervalSec: 15,
  lowHealthAlertCutoff: 60,
  speedCeilingKmh: 80,
  emailDigestEnabled: true,
  criticalPushEnabled: true,
  maintenanceReminderDays: 7,
  digilockerEnabled: false,
}

export interface AddVehiclePayload {
  registrationNumber: string
  make: string
  model: string
  category: Vehicle['category']
  powertrain: Vehicle['powertrain']
  fuelType: Vehicle['fuelType']
  year: number
  odometerKm: number
  dailyAvgKm: number
  corridorId: string
  assignedDriverId: string | null
  insuranceProvider: string
  insuranceExpiry: string
  registrationExpiry: string
  fitnessExpiry?: string
  pucExpiry?: string
  permitExpiry?: string
  specs?: Vehicle['specs']
}

export interface FleetContextValue {
  environment: OperatingEnvironment
  organizations: Organization[]
  activeOrganization: Organization
  setActiveOrganizationId: (orgId: string) => void
  activeRole: OrganizationRole
  setActiveRole: (role: OrganizationRole) => void
  reportingPeriod: ReportingPeriod
  setReportingPeriod: (period: ReportingPeriod) => void
  searchTerm: string
  setSearchTerm: (term: string) => void
  simulationActive: boolean
  toggleSimulation: () => void
  refreshStatus: RefreshStatus
  lastRefreshedAt: string
  refreshIntelligence: () => Promise<void>
  corridors: RegionalCorridor[]
  members: OrganizationMember[]
  inviteMember: (fullName: string, email: string, role: OrganizationRole) => Promise<{ temporaryCredentials?: { username: string; temporaryPassword: string } }>
  updateMemberRole: (memberId: string, role: OrganizationRole) => void
  vehicles: Vehicle[]
  archivedVehicles: Vehicle[]
  allOrgVehiclesCount: number
  drivers: Driver[]
  driverEvents: DriverBehaviorEvent[]
  driverAssignments: DriverAssignmentHistoryItem[]
  trips: Trip[]
  fuelTransactions: FuelTransaction[]
  maintenanceRecords: MaintenanceRecord[]
  inspections: VehicleInspection[]
  serviceSchedules: ServiceScheduleReminder[]
  smallIssues: SmallIssueLog[]
  places: PlaceRecord[]
  workOrders: WorkOrder[]
  partsInventory: PartInventoryItem[]
  suppliers: SupplierRecord[]
  purchaseOrders: PurchaseOrder[]
  inventoryTransactions: InventoryTransaction[]
  workshops: WorkshopVendor[]
  invoices: FinancialInvoice[]
  payments: PaymentRecord[]
  documentVault: DocumentVaultItem[]
  tyrePositions: TyrePositionRecord[]
  alerts: OperationalAlert[]
  predictions: AIPrediction[]
  riskAssessments: RiskAssessmentItem[]
  financialSummary: ReturnType<typeof computeFinancialIntelligence>
  financialLedgerSummary: ReturnType<typeof computeFinancialLedgerSummary>
  auditLogs: AuditLogEntry[]
  reports: ReportHistoryItem[]
  settings: WorkspaceSettings
  unreadAlertCount: number
  nowTick: number
  addVehicle: (payload: AddVehiclePayload) => Vehicle
  updateVehicle: (vehicleId: string, patch: Partial<Vehicle>) => void
  decommissionVehicle: (vehicleId: string) => void
  restoreVehicle: (vehicleId: string) => void
  assignDriverToVehicle: (vehicleId: string, driverId: string | null) => void
  addDriver: (payload: {
    name: string
    mobile: string
    email: string
    licenseNumber: string
    licenseExpiry: string
    licenseCategories?: Driver['licenseCategories']
    licenseIssuingRto?: string
    city?: string
    state?: string
    emergencyContactName?: string
    emergencyContactPhone?: string
  }) => Driver
  updateDriverDetails: (driverId: string, patch: Partial<Driver>) => void
  updateDriverOperationalStatus: (driverId: string, operationalStatus: DriverOperationalStatus) => void
  disputeDriverEvent: (eventId: string, reason: string) => void
  resolveDriverEventDispute: (eventId: string, decision: 'accepted_dismissed' | 'rejected_upheld', note: string) => void
  startTrip: (driverId: string, vehicleId: string, origin?: string, destination?: string, offlineMode?: boolean) => Trip | null
  endTrip: (tripId: string) => void
  scheduleTrip: (payload: { vehicleId: string; driverId: string; originAddress: string; destinationAddress: string }) => Trip | null
  syncOfflineTrips: () => number
  addFuelTransaction: (payload: Omit<FuelTransaction, 'id' | 'organizationId' | 'environment' | 'anomalyFlags' | 'verificationStatus'>) => FuelTransaction
  verifyFuelTransaction: (txId: string, status: 'verified' | 'needs_review') => void
  scheduleMaintenance: (payload: {
    vehicleId: string
    serviceType: string
    componentName: ComponentCategory | 'General Service'
    serviceCenter: string
    description: string
    costInr: number
    performedAt: string
    linkedPredictionId?: string
    billNumber?: string
  }) => MaintenanceRecord
  completeMaintenance: (recordId: string) => void
  resolvePrediction: (predictionId: string) => void
  recalculatePredictions: () => void
  submitVehicleInspection: (payload: Omit<VehicleInspection, 'id' | 'organizationId' | 'environment' | 'timestamp' | 'passed'>) => VehicleInspection
  addServiceSchedule: (payload: Omit<ServiceScheduleReminder, 'id' | 'organizationId'>) => ServiceScheduleReminder
  completeServiceSchedule: (scheduleId: string) => void
  addSmallIssue: (payload: Omit<SmallIssueLog, 'id' | 'organizationId' | 'reportedAt' | 'reportedBy' | 'status'>) => SmallIssueLog
  addPlace: (payload: Omit<PlaceRecord, 'id' | 'organizationId'>) => PlaceRecord
  removePlace: (placeId: string) => void
  convertIssueToWorkOrder: (issueId: string, workshopId?: string, laborCostInr?: number) => WorkOrder | null
  createWorkOrder: (payload: {
    vehicleId: string
    title: string
    description: string
    healthArea: FiveAreaHealthCategory
    priority: WorkOrder['priority']
    workshopId?: string
    workshopName: string
    laborCostInr: number
    scheduledFor?: string
    tasks?: string[]
  }) => WorkOrder
  updateWorkOrderStatus: (workOrderId: string, status: WorkOrderStatus) => void
  addWorkOrderPart: (workOrderId: string, partId: string, quantity: number) => void
  addPartInventory: (payload: Omit<PartInventoryItem, 'id' | 'organizationId' | 'updatedAt'>) => PartInventoryItem
  adjustPartStock: (partId: string, quantityDelta: number, reason: string) => void
  createPurchaseOrder: (payload: {
    supplierId: string
    items: Array<{ partId: string; orderedQty: number }>
    expectedAt?: string
  }) => PurchaseOrder
  receivePurchaseOrderItems: (poId: string, receivedMap: Record<string, number>) => void
  addWorkshop: (payload: Omit<WorkshopVendor, 'id' | 'organizationId' | 'completedJobsCount' | 'totalSpendInr'>) => WorkshopVendor
  addFinancialInvoice: (payload: Omit<FinancialInvoice, 'id' | 'organizationId' | 'paidAmountInr' | 'status'>) => FinancialInvoice
  verifyFinancialInvoice: (invoiceId: string) => void
  recordInvoicePayment: (payload: {
    invoiceId: string
    amountInr: number
    paymentMethod: PaymentRecord['paymentMethod']
    referenceNumber: string
  }) => PaymentRecord
  uploadDocumentToVault: (payload: {
    entityType: 'vehicle' | 'driver'
    entityId: string
    category: string
    title: string
    maskedNumber?: string
    issuingAuthority?: string
    issuedDate?: string
    expiryDate?: string
    fileName: string
    mimeType: string
    contentBase64: string
  }) => Promise<DocumentVaultItem>
  verifyVaultDocument: (docId: string, status: 'verified' | 'rejected', rejectionReason?: string) => void
  updateTyrePosition: (tyreId: string, patch: Partial<TyrePositionRecord>) => void
  markAlertRead: (alertId: string) => void
  markAllAlertsRead: () => void
  acknowledgeAlert: (alertId: string) => void
  updateSubscriptionPlan: (planId: SubscriptionPlanId) => void
  updateOrganizationProfile: (patch: Partial<Pick<Organization, 'name' | 'city' | 'state' | 'timezone'>>) => void
  updateSettings: (patch: Partial<WorkspaceSettings>) => void
  recordReportGeneration: (entry: Omit<ReportHistoryItem, 'id' | 'organizationId' | 'environment' | 'generatedAt'>) => void
  updateTelemetryState: (vehicleId: string, patch: Partial<Vehicle['telemetry']>) => void
  resetCurrentEnvironment: () => void
}

const FleetContext = createContext<FleetContextValue | undefined>(undefined)

export function FleetProvider({ children }: { children: React.ReactNode }) {
  const { user, organization, passwordChangeRequired } = useAuth()
  const environment: OperatingEnvironment = 'production'

  const [dataset, setDataset] = useState<EnvironmentDataset>(() => buildSeedDataset('production'))
  const [activeOrganizationId, setActiveOrgState] = useState<string>(() => dataset.organizations[0]?.id || 'org-kaveri')
  const [activeRole, setActiveRoleState] = useState<OrganizationRole>('fleet_manager')
  const [reportingPeriod, setReportingPeriod] = useState<ReportingPeriod>('30d')
  const [searchTerm, setSearchTerm] = useState('')
  const [simulationActive, setSimulationActive] = useState(false)
  const [predictionStatusOverrides, setPredictionStatusOverrides] = useState<Record<string, AIPrediction['status']>>({})
  const [predictionTick, setPredictionTick] = useState<number>(() => Date.now())
  const [refreshStatus, setRefreshStatus] = useState<RefreshStatus>('idle')
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>(() => new Date().toISOString())
  const serverHydratedRef = useRef(false)
  const wasAuthenticatedRef = useRef(false)
  const seqRef = useRef(1)
  const saveTimerRef = useRef<number | null>(null)

  const [settings, setSettings] = useState<WorkspaceSettings>(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY)
      return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<WorkspaceSettings>) } : DEFAULT_SETTINGS
    } catch {
      return DEFAULT_SETTINGS
    }
  })

  // Hydrate live organization state from authenticated backend
  const hydrateFromServer = useCallback(async () => {
    if (!user || passwordChangeRequired || user.role === 'platform_admin') {
      serverHydratedRef.current = false
      return
    }
    try {
      const res = await fetch('/api/fleet/bootstrap', { credentials: 'include' })
      if (!res.ok) return
      const payload = (await res.json()) as {
        organization: Organization
        role: OrganizationRole
        updatedAt: string
        data: Partial<EnvironmentDataset>
      }
      if (!payload?.organization || !payload?.data) return
      serverHydratedRef.current = true
      setActiveRoleState(payload.role)
      setActiveOrgState(payload.organization.id)
      setLastRefreshedAt(payload.updatedAt || new Date().toISOString())
      setDataset((prev) => ({
        ...prev,
        organizations: [payload.organization],
        members: payload.data.members ?? [],
        vehicles: payload.data.vehicles ?? [],
        drivers: payload.data.drivers ?? [],
        driverEvents: payload.data.driverEvents ?? [],
        driverAssignments: payload.data.driverAssignments ?? [],
        trips: payload.data.trips ?? [],
        fuelTransactions: payload.data.fuelTransactions ?? [],
        maintenanceRecords: payload.data.maintenanceRecords ?? [],
        inspections: payload.data.inspections ?? [],
        serviceSchedules: payload.data.serviceSchedules ?? [],
        smallIssues: payload.data.smallIssues ?? [],
        places: payload.data.places ?? [],
        workOrders: payload.data.workOrders ?? [],
        partsInventory: payload.data.partsInventory ?? [],
        suppliers: payload.data.suppliers ?? [],
        purchaseOrders: payload.data.purchaseOrders ?? [],
        inventoryTransactions: payload.data.inventoryTransactions ?? [],
        workshops: payload.data.workshops ?? [],
        invoices: payload.data.invoices ?? [],
        payments: payload.data.payments ?? [],
        documentVault: payload.data.documentVault ?? [],
        tyrePositions: payload.data.tyrePositions ?? [],
        alerts: payload.data.alerts ?? [],
        auditLogs: payload.data.auditLogs ?? [],
        reports: payload.data.reports ?? [],
      }))
    } catch {
      // Fallback gracefully when running headless unit tests without Express
    }
  }, [user, passwordChangeRequired])

  useEffect(() => {
    if (user) {
      wasAuthenticatedRef.current = true
      queueMicrotask(() => {
        setActiveRoleState(user.role)
        if (organization) {
          setActiveOrgState(organization.id)
        }
        void hydrateFromServer()
      })
    } else if (wasAuthenticatedRef.current) {
      wasAuthenticatedRef.current = false
      serverHydratedRef.current = false
      queueMicrotask(() => {
        const seed = buildSeedDataset('production')
        setDataset(seed)
        setActiveRoleState('fleet_manager')
        setActiveOrgState(seed.organizations[0]?.id ?? 'org-kaveri')
      })
    }
  }, [user, organization, hydrateFromServer])

  const persistOrgBlobToServer = useCallback(
    (nextDataset: EnvironmentDataset, orgId: string) => {
      if (!serverHydratedRef.current || !user || user.role === 'platform_admin') return
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = window.setTimeout(() => {
        const scoped = {
          members: nextDataset.members.filter((m) => m.organizationId === orgId),
          vehicles: nextDataset.vehicles.filter((v) => v.organizationId === orgId),
          drivers: nextDataset.drivers.filter((d) => d.organizationId === orgId),
          driverEvents: nextDataset.driverEvents.filter((e) => e.organizationId === orgId),
          driverAssignments: nextDataset.driverAssignments.filter((a) => a.organizationId === orgId),
          trips: nextDataset.trips.filter((t) => t.organizationId === orgId),
          fuelTransactions: nextDataset.fuelTransactions.filter((f) => f.organizationId === orgId),
          maintenanceRecords: nextDataset.maintenanceRecords.filter((m) => m.organizationId === orgId),
          inspections: nextDataset.inspections.filter((i) => i.organizationId === orgId),
          serviceSchedules: nextDataset.serviceSchedules.filter((s) => s.organizationId === orgId),
          smallIssues: nextDataset.smallIssues.filter((s) => s.organizationId === orgId),
          places: (nextDataset.places ?? []).filter((pl) => pl.organizationId === orgId),
          workOrders: nextDataset.workOrders.filter((w) => w.organizationId === orgId),
          partsInventory: nextDataset.partsInventory.filter((p) => p.organizationId === orgId),
          suppliers: nextDataset.suppliers.filter((s) => s.organizationId === orgId),
          purchaseOrders: nextDataset.purchaseOrders.filter((p) => p.organizationId === orgId),
          inventoryTransactions: nextDataset.inventoryTransactions.filter((t) => t.organizationId === orgId),
          workshops: nextDataset.workshops.filter((w) => w.organizationId === orgId),
          invoices: nextDataset.invoices.filter((i) => i.organizationId === orgId),
          payments: nextDataset.payments.filter((p) => p.organizationId === orgId),
          documentVault: nextDataset.documentVault.filter((d) => d.organizationId === orgId),
          tyrePositions: nextDataset.tyrePositions.filter((t) =>
            nextDataset.vehicles.some((v) => v.organizationId === orgId && v.id === t.vehicleId),
          ),
          alerts: nextDataset.alerts.filter((a) => a.organizationId === orgId),
          auditLogs: nextDataset.auditLogs.filter((a) => a.organizationId === orgId),
          reports: nextDataset.reports.filter((r) => r.organizationId === orgId),
        }
        void fetch('/api/fleet/state', {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: scoped }),
        }).catch(() => {
          // ignore transient network errors
        })
      }, 250)
    },
    [user],
  )

  const commitDataset = useCallback(
    (updater: (prev: EnvironmentDataset) => EnvironmentDataset) => {
      setDataset((prev) => {
        const next = updater(prev)
        persistOrgBlobToServer(next, activeOrganizationId)
        return next
      })
    },
    [persistOrgBlobToServer, activeOrganizationId],
  )

  const activeOrganization = useMemo(() => {
    return (
      dataset.organizations.find((o) => o.id === activeOrganizationId) ??
      organization ??
      dataset.organizations[0] ?? {
        id: 'org-fallback',
        name: 'DriveMitra Fleet',
        code: 'DM-01',
        city: 'Chennai',
        state: 'Tamil Nadu',
        timezone: 'Asia/Kolkata',
        currency: 'INR' as const,
        planId: 'starter' as const,
        vehicleLimit: 15,
        driverLimit: 25,
        status: 'active' as const,
        paymentStatus: 'paid' as const,
        subscriptionStartDate: '2026-01-01',
        subscriptionExpiryDate: '2027-01-01',
        createdAt: '2026-01-01T00:00:00.000Z',
        environment: 'production' as const,
      }
    )
  }, [dataset.organizations, activeOrganizationId, organization])

  const setActiveOrganizationId = useCallback((orgId: string) => {
    setActiveOrgState(orgId)
  }, [])

  const setActiveRole = useCallback((role: OrganizationRole) => {
    setActiveRoleState(role)
  }, [])

  const resetCurrentEnvironment = useCallback(() => {
    const fresh = buildSeedDataset('production')
    setDataset(fresh)
    setActiveOrgState(fresh.organizations[0]?.id ?? 'org-kaveri')
    setPredictionStatusOverrides({})
    setPredictionTick(Date.now())
  }, [])

  useEffect(() => {
    const freshnessTimer = window.setInterval(() => {
      setPredictionTick(Date.now())
    }, 20000)
    return () => window.clearInterval(freshnessTimer)
  }, [])

  const refreshIntelligence = useCallback(async () => {
    setRefreshStatus('refreshing')
    try {
      if (serverHydratedRef.current) {
        await hydrateFromServer()
      }
      setPredictionTick(Date.now())
      setLastRefreshedAt(new Date().toISOString())
      setRefreshStatus('updated')
    } catch {
      setRefreshStatus('failed')
    }
  }, [hydrateFromServer])

  const appendAudit = (
    logs: AuditLogEntry[],
    action: string,
    entityType: string,
    entityId: string,
    summary: string,
  ): AuditLogEntry[] => [
    {
      id: `aud-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      organizationId: activeOrganization.id,
      environment,
      actorName: user?.fullName ?? 'Fleet Owner Session',
      actorRole: activeRole,
      action,
      entityType,
      entityId,
      summary,
      timestamp: new Date().toISOString(),
    },
    ...logs,
  ]

  // Organization-isolated views
  const members = useMemo(
    () => dataset.members.filter((m) => m.organizationId === activeOrganization.id),
    [dataset.members, activeOrganization.id],
  )
  const orgAllVehicles = useMemo(
    () => dataset.vehicles.filter((v) => v.organizationId === activeOrganization.id),
    [dataset.vehicles, activeOrganization.id],
  )
  const vehicles = useMemo(
    () => orgAllVehicles.filter((v) => !v.decommissioned),
    [orgAllVehicles],
  )
  const archivedVehicles = useMemo(
    () => orgAllVehicles.filter((v) => Boolean(v.decommissioned)),
    [orgAllVehicles],
  )
  const driverEvents = useMemo(
    () => dataset.driverEvents.filter((e) => e.organizationId === activeOrganization.id),
    [dataset.driverEvents, activeOrganization.id],
  )
  const driverAssignments = useMemo(
    () => dataset.driverAssignments.filter((a) => a.organizationId === activeOrganization.id),
    [dataset.driverAssignments, activeOrganization.id],
  )
  const trips = useMemo(
    () => dataset.trips.filter((t) => t.organizationId === activeOrganization.id),
    [dataset.trips, activeOrganization.id],
  )

  const drivers = useMemo(() => {
    const orgDrivers = dataset.drivers.filter((d) => d.organizationId === activeOrganization.id)
    return orgDrivers.map((drv) => {
      const evaluation = evaluateDriverSafety({
        driver: drv,
        events: driverEvents,
        trips,
        corridors: REGIONAL_CORRIDORS,
        vehicles,
      })
      return {
        ...drv,
        safetyScore: evaluation.overallScore,
        speedingScore: evaluation.speedingScore,
        brakingScore: evaluation.brakingScore,
        accelerationScore: evaluation.accelerationScore,
        corneringScore: evaluation.corneringScore,
        fatigueComplianceScore: evaluation.fatigueComplianceScore,
        coachingRecommendations: evaluation.coachingRecommendations,
        dataConfidenceNote: evaluation.roadAdjustedNote,
      }
    })
  }, [dataset.drivers, activeOrganization.id, driverEvents, trips, vehicles])

  const rawOrgFuel = useMemo(
    () => dataset.fuelTransactions.filter((f) => f.organizationId === activeOrganization.id),
    [dataset.fuelTransactions, activeOrganization.id],
  )
  const fuelTransactions = useMemo(
    () => analyzeFuelTransactions(rawOrgFuel, vehicles),
    [rawOrgFuel, vehicles],
  )
  const maintenanceRecords = useMemo(
    () => dataset.maintenanceRecords.filter((m) => m.organizationId === activeOrganization.id),
    [dataset.maintenanceRecords, activeOrganization.id],
  )
  const inspections = useMemo(
    () => dataset.inspections.filter((i) => i.organizationId === activeOrganization.id),
    [dataset.inspections, activeOrganization.id],
  )
  const serviceSchedules = useMemo(
    () => dataset.serviceSchedules.filter((s) => s.organizationId === activeOrganization.id),
    [dataset.serviceSchedules, activeOrganization.id],
  )
  const places = useMemo(
    () => (dataset.places ?? []).filter((pl) => pl.organizationId === activeOrganization.id),
    [dataset.places, activeOrganization.id],
  )
  const smallIssues = useMemo(
    () => dataset.smallIssues.filter((s) => s.organizationId === activeOrganization.id),
    [dataset.smallIssues, activeOrganization.id],
  )
  const workOrders = useMemo(
    () => dataset.workOrders.filter((w) => w.organizationId === activeOrganization.id),
    [dataset.workOrders, activeOrganization.id],
  )
  const partsInventory = useMemo(
    () => dataset.partsInventory.filter((p) => p.organizationId === activeOrganization.id),
    [dataset.partsInventory, activeOrganization.id],
  )
  const suppliers = useMemo(
    () => dataset.suppliers.filter((s) => s.organizationId === activeOrganization.id),
    [dataset.suppliers, activeOrganization.id],
  )
  const purchaseOrders = useMemo(
    () => dataset.purchaseOrders.filter((p) => p.organizationId === activeOrganization.id),
    [dataset.purchaseOrders, activeOrganization.id],
  )
  const inventoryTransactions = useMemo(
    () => dataset.inventoryTransactions.filter((t) => t.organizationId === activeOrganization.id),
    [dataset.inventoryTransactions, activeOrganization.id],
  )
  const workshops = useMemo(
    () => dataset.workshops.filter((w) => w.organizationId === activeOrganization.id),
    [dataset.workshops, activeOrganization.id],
  )
  const invoices = useMemo(
    () => dataset.invoices.filter((i) => i.organizationId === activeOrganization.id),
    [dataset.invoices, activeOrganization.id],
  )
  const payments = useMemo(
    () => dataset.payments.filter((p) => p.organizationId === activeOrganization.id),
    [dataset.payments, activeOrganization.id],
  )
  const documentVault = useMemo(
    () => dataset.documentVault.filter((d) => d.organizationId === activeOrganization.id),
    [dataset.documentVault, activeOrganization.id],
  )
  const tyrePositions = useMemo(() => {
    const vehicleIds = new Set(orgAllVehicles.map((v) => v.id))
    return dataset.tyrePositions.filter((t) => vehicleIds.has(t.vehicleId))
  }, [dataset.tyrePositions, orgAllVehicles])

  const alerts = useMemo(
    () => dataset.alerts.filter((a) => a.organizationId === activeOrganization.id),
    [dataset.alerts, activeOrganization.id],
  )
  const auditLogs = useMemo(
    () => dataset.auditLogs.filter((a) => a.organizationId === activeOrganization.id),
    [dataset.auditLogs, activeOrganization.id],
  )
  const reports = useMemo(
    () => dataset.reports.filter((r) => r.organizationId === activeOrganization.id),
    [dataset.reports, activeOrganization.id],
  )

  const predictions = useMemo(() => {
    const generated = generateFleetPredictions({
      vehicles,
      corridors: REGIONAL_CORRIDORS,
      driverEvents,
      inspections,
      nowMs: predictionTick,
    })
    return generated.map((pred) => {
      const override = predictionStatusOverrides[pred.id]
      if (override) return { ...pred, status: override }
      const linkedMaint = maintenanceRecords.find((m) => m.linkedPredictionId === pred.id)
      if (linkedMaint) {
        return {
          ...pred,
          status: linkedMaint.status === 'completed' ? ('resolved' as const) : ('scheduled' as const),
        }
      }
      return pred
    })
  }, [vehicles, driverEvents, inspections, predictionTick, predictionStatusOverrides, maintenanceRecords])

  const riskAssessments = useMemo(
    () =>
      buildFleetRiskAssessments({
        organizationId: activeOrganization.id,
        vehicles,
        predictions,
        drivers,
        driverEvents,
        fuelTransactions,
        trips,
        inspections,
        partsInventory,
        invoices,
        corridors: REGIONAL_CORRIDORS,
        nowMs: predictionTick,
      }),
    [
      activeOrganization.id,
      vehicles,
      predictions,
      drivers,
      driverEvents,
      fuelTransactions,
      trips,
      inspections,
      partsInventory,
      invoices,
      predictionTick,
    ],
  )

  const financialSummary = useMemo(
    () =>
      computeFinancialIntelligence({
        vehicles,
        fuelTransactions,
        maintenanceRecords,
        predictions,
        trips,
        workOrders,
        period: reportingPeriod,
      }),
    [vehicles, fuelTransactions, maintenanceRecords, predictions, trips, workOrders, reportingPeriod],
  )

  const financialLedgerSummary = useMemo(
    () =>
      computeFinancialLedgerSummary({
        invoices,
        payments,
        workOrders,
        purchaseOrders,
        fuelTransactions,
      }),
    [invoices, payments, workOrders, purchaseOrders, fuelTransactions],
  )

  const unreadAlertCount = useMemo(() => alerts.filter((a) => !a.read).length, [alerts])

  const inviteMember = async (fullName: string, email: string, role: OrganizationRole) => {
    assertRolePermission(activeRole, 'manage_members')
    if (role === 'platform_admin' && activeRole !== 'platform_admin') {
      throw new Error('Only Platform Super Admins can assign platform_admin.')
    }
    if (!fullName.trim() || !email.trim()) {
      throw new Error('Member name and email are required.')
    }
    if (serverHydratedRef.current) {
      const res = await fetch('/api/fleet/members', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: fullName.trim(), email: email.trim().toLowerCase(), role }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Unable to provision team member.')
      }
      commitDataset((prev) => ({
        ...prev,
        members: [data.member as OrganizationMember, ...prev.members],
        auditLogs: appendAudit(
          prev.auditLogs,
          'CREATED_MEMBER',
          'member',
          data.member.id,
          `Provisioned ${fullName.trim()} (${role}) with temporary password`,
        ),
      }))
      return { temporaryCredentials: data.temporaryCredentials }
    }

    const member: OrganizationMember = {
      id: `mem-${Date.now()}`,
      organizationId: activeOrganization.id,
      userId: `usr-${Date.now()}`,
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      role,
      status: 'active',
      lastActiveAt: new Date().toISOString(),
    }
    commitDataset((prev) => ({
      ...prev,
      members: [member, ...prev.members],
      auditLogs: appendAudit(prev.auditLogs, 'CREATED_MEMBER', 'member', member.id, `Added ${member.fullName} (${role})`),
    }))
    return {}
  }

  const updateMemberRole = (memberId: string, role: OrganizationRole) => {
    assertRolePermission(activeRole, 'manage_members')
    if (role === 'platform_admin' && activeRole !== 'platform_admin') {
      throw new Error('Only Platform Super Admins can grant platform_admin.')
    }
    commitDataset((prev) => ({
      ...prev,
      members: prev.members.map((m) =>
        m.id === memberId && m.organizationId === activeOrganization.id ? { ...m, role } : m,
      ),
      auditLogs: appendAudit(prev.auditLogs, 'UPDATED_ROLE', 'member', memberId, `Changed member role to ${role}`),
    }))
  }

  const addVehicle = (payload: AddVehiclePayload): Vehicle => {
    assertRolePermission(activeRole, 'add_vehicle')
    const validationErr = validateVehiclePayload({
      registrationNumber: payload.registrationNumber,
      make: payload.make,
      model: payload.model,
      year: payload.year,
      odometerKm: payload.odometerKm,
      dailyAvgKm: payload.dailyAvgKm,
      existingVehicles: orgAllVehicles,
    })
    if (validationErr) throw new Error(validationErr)

    const corridor = REGIONAL_CORRIDORS.find((c) => c.id === payload.corridorId) ?? REGIONAL_CORRIDORS[0]
    const id = `v-${Date.now()}-${seqRef.current++}`
    const normalizedReg = normalizeRegistrationNumber(payload.registrationNumber)
    const today = new Date().toISOString().slice(0, 10)
    const baseComponents: Vehicle['components'] = [
      { id: `${id}-c1`, vehicleId: id, componentName: 'Engine', healthScore: 90, status: 'healthy', wearRatePer1000Km: payload.powertrain === 'EV' ? 0.14 : 0.38, lastServicedAt: today, predictedReplacementDate: '2027-02-01', notes: 'Baseline healthy' },
      { id: `${id}-c2`, vehicleId: id, componentName: 'Brakes', healthScore: 88, status: 'healthy', wearRatePer1000Km: 0.42, lastServicedAt: today, predictedReplacementDate: '2027-01-15', notes: 'Pad thickness baseline healthy' },
      { id: `${id}-c3`, vehicleId: id, componentName: 'Tyres', healthScore: 86, status: 'healthy', wearRatePer1000Km: 0.45, lastServicedAt: today, predictedReplacementDate: '2026-12-20', notes: 'Tread baseline healthy' },
      { id: `${id}-c4`, vehicleId: id, componentName: 'Battery', healthScore: 92, status: 'healthy', wearRatePer1000Km: 0.22, lastServicedAt: today, predictedReplacementDate: '2027-06-01', notes: '12V auxiliary system healthy' },
      { id: `${id}-c5`, vehicleId: id, componentName: 'Suspension', healthScore: 87, status: 'healthy', wearRatePer1000Km: 0.36, lastServicedAt: today, predictedReplacementDate: '2027-03-10', notes: 'Springs and dampers within range' },
      { id: `${id}-c6`, vehicleId: id, componentName: 'Transmission', healthScore: 90, status: 'healthy', wearRatePer1000Km: 0.3, lastServicedAt: today, predictedReplacementDate: '2027-05-01', notes: 'Gearbox / reduction drive smooth' },
      { id: `${id}-c7`, vehicleId: id, componentName: 'Cooling System', healthScore: 89, status: 'healthy', wearRatePer1000Km: 0.28, lastServicedAt: today, predictedReplacementDate: '2027-04-01', notes: 'Coolant circulation stable' },
    ]
    if (payload.powertrain === 'EV') {
      baseComponents.push({
        id: `${id}-c8`,
        vehicleId: id,
        componentName: 'EV Battery',
        healthScore: 94,
        status: 'healthy',
        wearRatePer1000Km: 0.16,
        lastServicedAt: today,
        predictedReplacementDate: '2029-01-01',
        notes: 'High-voltage pack baseline 94% SOH',
      })
    }

    const newVehicle: Vehicle = {
      id,
      organizationId: activeOrganization.id,
      environment,
      registrationNumber: normalizedReg,
      make: payload.make.trim(),
      model: payload.model.trim(),
      category: payload.category,
      powertrain: payload.powertrain,
      fuelType: payload.fuelType,
      year: payload.year,
      assignedDriverId: payload.assignedDriverId,
      odometerKm: Math.round(payload.odometerKm),
      dailyAvgKm: Math.round(payload.dailyAvgKm),
      healthScore: 89,
      operationStatus: 'stopped',
      fuelOrSocPct: 80,
      corridorId: corridor.id,
      cityName: corridor.name,
      registrationExpiry: payload.registrationExpiry,
      insuranceExpiry: payload.insuranceExpiry,
      insuranceProvider: payload.insuranceProvider,
      fitnessExpiry: payload.fitnessExpiry,
      pucExpiry: payload.pucExpiry,
      permitExpiry: payload.permitExpiry,
      specs: payload.specs ?? {
        heightMeters: 3.1,
        widthMeters: 2.25,
        lengthMeters: 6.4,
        grossVehicleWeightKg: payload.category === 'Heavy Truck' ? 16200 : 7490,
        axleCount: payload.category === 'Heavy Truck' ? 3 : 2,
        payloadCapacityKg: payload.category === 'Heavy Truck' ? 9500 : 3500,
        cargoType: 'General Freight',
        emissionNorm: payload.powertrain === 'EV' ? 'EV-Zero' : 'BS-VI',
      },
      lastServiceDate: today,
      nextServiceDueDate: new Date(Date.now() + 120 * 86400000).toISOString().slice(0, 10),
      nextServiceDueOdometerKm: Math.round(payload.odometerKm) + 10000,
      monthlyRevenueInr: 145000,
      telemetry: {
        vehicleId: id,
        location: getCorridorSeedLocation(corridor.id, orgAllVehicles.length),
        cityLabel: `${corridor.name} Depot`,
        speedKmh: 0,
        heading: 0,
        gpsAccuracyMeters: 10,
        signalQualityPct: 90,
        connectionState: 'connected',
        source: 'smartphone_gps',
        lastUpdatedAt: new Date().toISOString(),
        batteryLevelPct: 88,
        motionPermissionGranted: true,
      },
      components: baseComponents,
      decommissioned: false,
    }

    commitDataset((prev) => ({
      ...prev,
      vehicles: [newVehicle, ...prev.vehicles],
      drivers: payload.assignedDriverId
        ? prev.drivers.map((d) => (d.id === payload.assignedDriverId ? { ...d, assignedVehicleId: id } : d))
        : prev.drivers,
      auditLogs: appendAudit(prev.auditLogs, 'ADDED_VEHICLE', 'vehicle', id, `Registered ${newVehicle.registrationNumber}`),
    }))
    return newVehicle
  }

  const updateVehicle = (vehicleId: string, patch: Partial<Vehicle>) => {
    assertRolePermission(activeRole, 'edit_vehicle')
    const current = orgAllVehicles.find((v) => v.id === vehicleId)
    if (!current) return
    const nextReg = patch.registrationNumber ?? current.registrationNumber
    const nextMake = patch.make ?? current.make
    const nextModel = patch.model ?? current.model
    const nextYear = patch.year ?? current.year
    const nextOdo = patch.odometerKm ?? current.odometerKm
    const nextDaily = patch.dailyAvgKm ?? current.dailyAvgKm
    const validationErr = validateVehiclePayload({
      registrationNumber: nextReg,
      make: nextMake,
      model: nextModel,
      year: nextYear,
      odometerKm: nextOdo,
      dailyAvgKm: nextDaily,
      existingVehicles: orgAllVehicles,
      excludeVehicleId: vehicleId,
    })
    if (validationErr) throw new Error(validationErr)

    const normalizedPatch = {
      ...patch,
      registrationNumber: normalizeRegistrationNumber(nextReg),
    }

    commitDataset((prev) => ({
      ...prev,
      vehicles: prev.vehicles.map((v) =>
        v.id === vehicleId && v.organizationId === activeOrganization.id ? { ...v, ...normalizedPatch } : v,
      ),
      auditLogs: appendAudit(
        prev.auditLogs,
        'UPDATED_VEHICLE',
        'vehicle',
        vehicleId,
        `Updated specifications for ${normalizeRegistrationNumber(nextReg)}`,
      ),
    }))
  }

  const decommissionVehicle = (vehicleId: string) => {
    assertRolePermission(activeRole, 'decommission_vehicle')
    const target = orgAllVehicles.find((v) => v.id === vehicleId)
    if (!target || target.decommissioned) return
    const closedAt = new Date().toISOString()
    commitDataset((prev) => ({
      ...prev,
      vehicles: prev.vehicles.map((v) =>
        v.id === vehicleId && v.organizationId === activeOrganization.id
          ? {
              ...v,
              decommissioned: true,
              operationStatus: 'stopped',
              assignedDriverId: null,
              telemetry: { ...v.telemetry, speedKmh: 0 },
            }
          : v,
      ),
      trips: prev.trips.map((t) =>
        t.vehicleId === vehicleId &&
        t.organizationId === activeOrganization.id &&
        (t.status === 'active' || t.status === 'delayed')
          ? { ...t, status: 'interrupted', endTime: closedAt }
          : t,
      ),
      drivers: prev.drivers.map((d) =>
        d.assignedVehicleId === vehicleId && d.organizationId === activeOrganization.id
          ? { ...d, assignedVehicleId: null, status: d.status === 'on_trip' ? 'available' : d.status }
          : d,
      ),
      auditLogs: appendAudit(
        prev.auditLogs,
        'DECOMMISSIONED_VEHICLE',
        'vehicle',
        vehicleId,
        `Archived ${target.registrationNumber} while preserving trip, fuel, and maintenance history`,
      ),
    }))
  }

  const restoreVehicle = (vehicleId: string) => {
    assertRolePermission(activeRole, 'restore_vehicle')
    const target = orgAllVehicles.find((v) => v.id === vehicleId && v.decommissioned)
    if (!target) return
    const conflict = vehicles.find(
      (v) => normalizeRegistrationNumber(v.registrationNumber) === normalizeRegistrationNumber(target.registrationNumber),
    )
    if (conflict) {
      throw new Error(`Cannot restore ${target.registrationNumber}: an active vehicle already uses this registration.`)
    }
    commitDataset((prev) => ({
      ...prev,
      vehicles: prev.vehicles.map((v) =>
        v.id === vehicleId && v.organizationId === activeOrganization.id
          ? { ...v, decommissioned: false, operationStatus: 'stopped' }
          : v,
      ),
      auditLogs: appendAudit(
        prev.auditLogs,
        'RESTORED_VEHICLE',
        'vehicle',
        vehicleId,
        `Restored ${target.registrationNumber} to active fleet`,
      ),
    }))
  }

  const assignDriverToVehicle = (vehicleId: string, driverId: string | null) => {
    assertRolePermission(activeRole, 'assign_driver')
    const veh = vehicles.find((v) => v.id === vehicleId)
    if (!veh) return
    const nowIso = new Date().toISOString()
    commitDataset((prev) => {
      const closedHistory = prev.driverAssignments.map((a) =>
        a.organizationId === activeOrganization.id &&
        !a.unassignedAt &&
        (a.vehicleId === vehicleId || (driverId && a.driverId === driverId))
          ? { ...a, unassignedAt: nowIso }
          : a,
      )
      const nextHistory = driverId
        ? [
            {
              id: `asgn-${Date.now()}`,
              organizationId: activeOrganization.id,
              driverId,
              vehicleId,
              vehicleRegistration: veh.registrationNumber,
              assignedAt: nowIso,
              assignedBy: user?.fullName ?? 'Fleet Manager',
              notes: 'Assigned via ERP workspace',
            },
            ...closedHistory,
          ]
        : closedHistory

      return {
        ...prev,
        vehicles: prev.vehicles.map((v) => {
          if (v.organizationId !== activeOrganization.id) return v
          if (v.id === vehicleId) return { ...v, assignedDriverId: driverId }
          if (driverId && v.assignedDriverId === driverId) return { ...v, assignedDriverId: null }
          return v
        }),
        drivers: prev.drivers.map((d) => {
          if (d.organizationId !== activeOrganization.id) return d
          if (d.id === driverId) return { ...d, assignedVehicleId: vehicleId }
          if (d.assignedVehicleId === vehicleId) return { ...d, assignedVehicleId: null }
          return d
        }),
        driverAssignments: nextHistory,
        auditLogs: appendAudit(
          prev.auditLogs,
          'ASSIGNED_DRIVER',
          'vehicle',
          vehicleId,
          `Assigned driver ${driverId ?? 'None'} to ${veh.registrationNumber}`,
        ),
      }
    })
  }

  const addDriver = (payload: {
    name: string
    mobile: string
    email: string
    licenseNumber: string
    licenseExpiry: string
    licenseCategories?: Driver['licenseCategories']
    licenseIssuingRto?: string
    city?: string
    state?: string
    emergencyContactName?: string
    emergencyContactPhone?: string
  }): Driver => {
    assertRolePermission(activeRole, 'add_driver')
    if (!payload.name.trim() || !payload.licenseNumber.trim()) {
      throw new Error('Driver name and Indian commercial licence number are required.')
    }
    const driver: Driver = {
      id: `d-${Date.now()}`,
      organizationId: activeOrganization.id,
      environment,
      employeeCode: `DRV-${Math.floor(100 + Math.random() * 899)}`,
      name: payload.name.trim(),
      mobile: payload.mobile.trim(),
      email: payload.email.trim(),
      city: payload.city?.trim() || activeOrganization.city,
      state: payload.state?.trim() || activeOrganization.state,
      emergencyContactName: payload.emergencyContactName?.trim(),
      emergencyContactPhone: payload.emergencyContactPhone?.trim(),
      licenseNumber: payload.licenseNumber.trim().toUpperCase(),
      licenseCategories: payload.licenseCategories?.length ? payload.licenseCategories : ['TRANS'],
      licenseIssuingRto: payload.licenseIssuingRto?.trim() || 'Regional RTO',
      licenseExpiry: payload.licenseExpiry,
      policeVerificationStatus: 'not_submitted',
      digilockerStatus: settings.digilockerEnabled ? 'not_connected' : 'disabled_by_admin',
      assignedVehicleId: null,
      operationalStatus: 'active',
      status: 'available',
      safetyScore: 85,
      speedingScore: 86,
      brakingScore: 85,
      accelerationScore: 84,
      corneringScore: 85,
      fatigueComplianceScore: 88,
      totalTrips: 0,
      totalDistanceKm: 0,
      joinDate: new Date().toISOString().slice(0, 10),
      coachingRecommendations: ['Newly onboarded commercial driver; monitor initial 10 trips for baseline calibration.'],
      dataConfidenceNote: 'New driver baseline',
    }
    commitDataset((prev) => ({
      ...prev,
      drivers: [driver, ...prev.drivers],
      auditLogs: appendAudit(prev.auditLogs, 'ADDED_DRIVER', 'driver', driver.id, `Added driver ${driver.name}`),
    }))
    return driver
  }

  const updateDriverDetails = (driverId: string, patch: Partial<Driver>) => {
    assertRolePermission(activeRole, 'manage_driver_status')
    commitDataset((prev) => ({
      ...prev,
      drivers: prev.drivers.map((d) =>
        d.id === driverId && d.organizationId === activeOrganization.id ? { ...d, ...patch } : d,
      ),
      auditLogs: appendAudit(prev.auditLogs, 'UPDATED_DRIVER', 'driver', driverId, 'Updated Indian driver compliance profile'),
    }))
  }

  const updateDriverOperationalStatus = (driverId: string, operationalStatus: DriverOperationalStatus) => {
    assertRolePermission(activeRole, 'manage_driver_status')
    const mappedStatus: Driver['status'] =
      operationalStatus === 'suspended'
        ? 'suspended'
        : operationalStatus === 'archived'
          ? 'archived'
          : operationalStatus === 'inactive'
            ? 'off_duty'
            : 'available'

    commitDataset((prev) => ({
      ...prev,
      drivers: prev.drivers.map((d) =>
        d.id === driverId && d.organizationId === activeOrganization.id
          ? {
              ...d,
              operationalStatus,
              status: mappedStatus,
              assignedVehicleId: operationalStatus === 'active' ? d.assignedVehicleId : null,
            }
          : d,
      ),
      vehicles:
        operationalStatus === 'active'
          ? prev.vehicles
          : prev.vehicles.map((v) =>
              v.organizationId === activeOrganization.id && v.assignedDriverId === driverId
                ? { ...v, assignedDriverId: null }
                : v,
            ),
      auditLogs: appendAudit(
        prev.auditLogs,
        'CHANGED_DRIVER_STATUS',
        'driver',
        driverId,
        `Changed driver operational status to ${operationalStatus}`,
      ),
    }))
  }

  const disputeDriverEvent = (eventId: string, reason: string) => {
    assertRolePermission(activeRole, 'dispute_driver_event')
    commitDataset((prev) => ({
      ...prev,
      driverEvents: prev.driverEvents.map((e) =>
        e.id === eventId && e.organizationId === activeOrganization.id
          ? { ...e, disputeStatus: 'disputed', disputeReason: reason }
          : e,
      ),
      auditLogs: appendAudit(prev.auditLogs, 'DISPUTED_EVENT', 'driver_event', eventId, reason),
    }))
  }

  const resolveDriverEventDispute = (
    eventId: string,
    decision: 'accepted_dismissed' | 'rejected_upheld',
    note: string,
  ) => {
    assertRolePermission(activeRole, 'resolve_driver_dispute')
    commitDataset((prev) => ({
      ...prev,
      driverEvents: prev.driverEvents.map((e) =>
        e.id === eventId && e.organizationId === activeOrganization.id
          ? { ...e, disputeStatus: decision, disputeResolutionNote: note }
          : e,
      ),
      auditLogs: appendAudit(prev.auditLogs, 'RESOLVED_EVENT_DISPUTE', 'driver_event', eventId, `${decision}: ${note}`),
    }))
  }

  const startTrip = (
    driverId: string,
    vehicleId: string,
    origin = 'Depot Dispatch Point',
    destination = 'Regional Delivery Zone',
    offlineMode = false,
  ): Trip | null => {
    assertRolePermission(activeRole, 'schedule_trip')
    const vehicle = vehicles.find((v) => v.id === vehicleId && !v.decommissioned)
    if (!vehicle) throw new Error('Selected vehicle is unavailable or decommissioned.')

    const existingActiveDriverTrip = trips.find((t) => t.driverId === driverId && t.status === 'active')
    const existingActiveVehicleTrip = trips.find((t) => t.vehicleId === vehicleId && t.status === 'active')
    if (existingActiveDriverTrip || existingActiveVehicleTrip) {
      throw new Error('An active trip is already running for this driver or vehicle.')
    }

    const trip: Trip = {
      id: `t-${Date.now()}-${Math.floor(Math.random() * 100)}`,
      organizationId: activeOrganization.id,
      environment,
      vehicleId,
      driverId,
      originAddress: origin.trim() || 'Depot Dispatch Point',
      destinationAddress: destination.trim() || 'Regional Delivery Zone',
      startLocation: vehicle.telemetry.location,
      startTime: new Date().toISOString(),
      distanceKm: 0,
      durationMinutes: 0,
      avgSpeedKmh: 0,
      maxSpeedKmh: 0,
      status: 'active',
      truckRoutingMode: 'highway_geometry_unverified',
      route: [vehicle.telemetry.location],
      speedTimeline: [{ minuteOffset: 0, label: 'Start', speedKmh: 0 }],
      stops: [],
      offlineSynced: !offlineMode,
    }
    commitDataset((prev) => ({
      ...prev,
      trips: [trip, ...prev.trips],
      vehicles: prev.vehicles.map((v) =>
        v.id === vehicleId && v.organizationId === activeOrganization.id
          ? {
              ...v,
              operationStatus: 'moving',
              telemetry: {
                ...v.telemetry,
                speedKmh: 34,
                connectionState: offlineMode ? 'intermittent' : 'connected',
                lastUpdatedAt: new Date().toISOString(),
              },
            }
          : v,
      ),
      drivers: prev.drivers.map((d) =>
        d.id === driverId && d.organizationId === activeOrganization.id ? { ...d, status: 'on_trip' } : d,
      ),
      auditLogs: appendAudit(prev.auditLogs, 'STARTED_TRIP', 'trip', trip.id, `Trip dispatched ${trip.originAddress} → ${trip.destinationAddress}`),
    }))
    return trip
  }

  const endTrip = (tripId: string) => {
    assertRolePermission(activeRole, 'end_trip')
    const trip = trips.find((t) => t.id === tripId)
    if (!trip || trip.status === 'completed') return

    const elapsedMin = Math.max(12, Math.round((Date.now() - new Date(trip.startTime).getTime()) / 60000))
    const completedKm = Math.max(8.5, trip.distanceKm || Number((elapsedMin * 0.55).toFixed(1)))
    commitDataset((prev) => ({
      ...prev,
      trips: prev.trips.map((t) =>
        t.id === tripId && t.organizationId === activeOrganization.id
          ? {
              ...t,
              status: 'completed',
              endTime: new Date().toISOString(),
              durationMinutes: elapsedMin,
              distanceKm: completedKm,
              avgSpeedKmh: Math.round((completedKm / elapsedMin) * 60),
              maxSpeedKmh: Math.max(t.maxSpeedKmh, 58),
            }
          : t,
      ),
      vehicles: prev.vehicles.map((v) =>
        v.id === trip.vehicleId && v.organizationId === activeOrganization.id
          ? {
              ...v,
              operationStatus: 'stopped',
              odometerKm: Math.round(v.odometerKm + completedKm),
              telemetry: { ...v.telemetry, speedKmh: 0, lastUpdatedAt: new Date().toISOString() },
            }
          : v,
      ),
      drivers: prev.drivers.map((d) =>
        d.id === trip.driverId && d.organizationId === activeOrganization.id
          ? {
              ...d,
              status: 'available',
              totalTrips: d.totalTrips + 1,
              totalDistanceKm: Math.round(d.totalDistanceKm + completedKm),
            }
          : d,
      ),
      auditLogs: appendAudit(prev.auditLogs, 'COMPLETED_TRIP', 'trip', tripId, `Completed trip (${completedKm} km)`),
    }))
  }

  const scheduleTrip = (payload: {
    vehicleId: string
    driverId: string
    originAddress: string
    destinationAddress: string
  }) => {
    assertRolePermission(activeRole, 'schedule_trip')
    return startTrip(payload.driverId, payload.vehicleId, payload.originAddress, payload.destinationAddress)
  }

  const syncOfflineTrips = (): number => 0

  const addFuelTransaction = (
    payload: Omit<FuelTransaction, 'id' | 'organizationId' | 'environment' | 'anomalyFlags' | 'verificationStatus'>,
  ): FuelTransaction => {
    assertRolePermission(activeRole, 'log_fuel')
    const err = validateFuelTransactionInput({
      vehicleId: payload.vehicleId,
      amountInr: payload.amountInr,
      litersOrKwh: payload.litersOrKwh,
      unitPriceInr: payload.unitPriceInr,
      odometerKm: payload.odometerKm,
      station: payload.station,
    })
    if (err) throw new Error(err)

    const newTx: FuelTransaction = {
      ...payload,
      station: payload.station.trim(),
      id: `f-${Date.now()}-${Math.floor(Math.random() * 100)}`,
      organizationId: activeOrganization.id,
      environment,
      verificationStatus: 'pending',
      paymentState: 'recorded',
      anomalyFlags: [],
    }
    commitDataset((prev) => ({
      ...prev,
      fuelTransactions: [newTx, ...prev.fuelTransactions],
      auditLogs: appendAudit(prev.auditLogs, 'LOGGED_FUEL', 'fuel_transaction', newTx.id, `Logged ₹${newTx.amountInr} at ${newTx.station}`),
    }))
    return newTx
  }

  const verifyFuelTransaction = (txId: string, status: 'verified' | 'needs_review') => {
    assertRolePermission(activeRole, 'verify_fuel')
    commitDataset((prev) => ({
      ...prev,
      fuelTransactions: prev.fuelTransactions.map((tx) =>
        tx.id === txId && tx.organizationId === activeOrganization.id
          ? { ...tx, verificationStatus: status, paymentState: status === 'verified' ? 'verified' : 'recorded' }
          : tx,
      ),
      auditLogs: appendAudit(prev.auditLogs, 'REVIEWED_FUEL', 'fuel_transaction', txId, `Marked fuel entry as ${status}`),
    }))
  }

  const scheduleMaintenance = (payload: {
    vehicleId: string
    serviceType: string
    componentName: ComponentCategory | 'General Service'
    serviceCenter: string
    description: string
    costInr: number
    performedAt: string
    linkedPredictionId?: string
    billNumber?: string
  }): MaintenanceRecord => {
    assertRolePermission(activeRole, 'schedule_maintenance')
    if (!Number.isFinite(payload.costInr) || payload.costInr < 0) {
      throw new Error('Maintenance estimate cost cannot be negative.')
    }
    const rec: MaintenanceRecord = {
      id: `m-${Date.now()}`,
      organizationId: activeOrganization.id,
      environment,
      vehicleId: payload.vehicleId,
      serviceType: payload.serviceType,
      componentName: payload.componentName,
      serviceCenter: payload.serviceCenter,
      description: payload.description,
      costInr: payload.costInr,
      paymentState: 'recorded',
      billNumber: payload.billNumber,
      downtimeDays: 1,
      partsReplaced: [],
      performedAt: payload.performedAt,
      status: 'scheduled',
      linkedPredictionId: payload.linkedPredictionId,
    }
    if (payload.linkedPredictionId) {
      setPredictionStatusOverrides((prev) => ({ ...prev, [payload.linkedPredictionId!]: 'scheduled' }))
    }
    commitDataset((prev) => ({
      ...prev,
      maintenanceRecords: [rec, ...prev.maintenanceRecords],
      auditLogs: appendAudit(prev.auditLogs, 'SCHEDULED_MAINTENANCE', 'maintenance', rec.id, `Scheduled ${payload.serviceType} at ${payload.serviceCenter}`),
    }))
    return rec
  }

  const completeMaintenance = (recordId: string) => {
    assertRolePermission(activeRole, 'complete_maintenance')
    const rec = maintenanceRecords.find((m) => m.id === recordId)
    if (!rec) return
    if (rec.linkedPredictionId) {
      setPredictionStatusOverrides((prev) => ({ ...prev, [rec.linkedPredictionId!]: 'resolved' }))
    }
    commitDataset((prev) => ({
      ...prev,
      maintenanceRecords: prev.maintenanceRecords.map((m) =>
        m.id === recordId && m.organizationId === activeOrganization.id
          ? { ...m, status: 'completed', performedAt: new Date().toISOString() }
          : m,
      ),
      vehicles: prev.vehicles.map((v) => {
        if (v.id !== rec.vehicleId || v.organizationId !== activeOrganization.id) return v
        const updatedComponents = v.components.map((c) =>
          c.componentName === rec.componentName
            ? { ...c, healthScore: Math.max(c.healthScore, 92), status: 'healthy' as const, lastServicedAt: new Date().toISOString().slice(0, 10) }
            : c,
        )
        const avg = Math.round(updatedComponents.reduce((s, c) => s + c.healthScore, 0) / updatedComponents.length)
        return {
          ...v,
          healthScore: avg,
          operationStatus: v.operationStatus === 'maintenance' ? 'stopped' : v.operationStatus,
          lastServiceDate: new Date().toISOString().slice(0, 10),
          components: updatedComponents,
        }
      }),
      auditLogs: appendAudit(prev.auditLogs, 'COMPLETED_MAINTENANCE', 'maintenance', recordId, `Completed service ${rec.serviceType}`),
    }))
  }

  const resolvePrediction = (predictionId: string) => {
    assertRolePermission(activeRole, 'resolve_prediction')
    setPredictionStatusOverrides((prev) => ({ ...prev, [predictionId]: 'resolved' }))
    commitDataset((prev) => ({
      ...prev,
      auditLogs: appendAudit(prev.auditLogs, 'RESOLVED_PREDICTION', 'ai_prediction', predictionId, 'Marked predictive maintenance alert as resolved'),
    }))
  }

  const recalculatePredictions = () => {
    setPredictionTick(Date.now())
  }

  const submitVehicleInspection = (
    payload: Omit<VehicleInspection, 'id' | 'organizationId' | 'environment' | 'timestamp' | 'passed'>,
  ): VehicleInspection => {
    assertRolePermission(activeRole, 'submit_inspection')
    const passed =
      payload.tyreCondition === 'good' &&
      payload.brakeFeel === 'normal' &&
      !payload.fluidLeaksDetected &&
      !payload.warningLightsOn &&
      !payload.batteryOrStartingIssue

    const insp: VehicleInspection = {
      ...payload,
      inspectorName: payload.inspectorName || user?.fullName || 'Fleet Operations Supervisor',
      id: `ins-${Date.now()}`,
      organizationId: activeOrganization.id,
      environment,
      timestamp: new Date().toISOString(),
      passed,
    }
    commitDataset((prev) => ({
      ...prev,
      inspections: [insp, ...prev.inspections],
      auditLogs: appendAudit(prev.auditLogs, 'SUBMITTED_INSPECTION', 'inspection', insp.id, `Pre-trip inspection ${passed ? 'passed' : 'flagged defects'}`),
    }))
    return insp
  }

  const addServiceSchedule = (payload: Omit<ServiceScheduleReminder, 'id' | 'organizationId'>): ServiceScheduleReminder => {
    assertRolePermission(activeRole, 'schedule_maintenance')
    const item: ServiceScheduleReminder = {
      ...payload,
      id: `sch-${Date.now()}`,
      organizationId: activeOrganization.id,
    }
    commitDataset((prev) => ({
      ...prev,
      serviceSchedules: [item, ...prev.serviceSchedules],
      auditLogs: appendAudit(prev.auditLogs, 'ADDED_SERVICE_REMINDER', 'service_schedule', item.id, `Added ${item.title}`),
    }))
    return item
  }

  const completeServiceSchedule = (scheduleId: string) => {
    assertRolePermission(activeRole, 'complete_maintenance')
    commitDataset((prev) => ({
      ...prev,
      serviceSchedules: prev.serviceSchedules.map((s) =>
        s.id === scheduleId && s.organizationId === activeOrganization.id ? { ...s, status: 'completed' } : s,
      ),
      auditLogs: appendAudit(prev.auditLogs, 'COMPLETED_SERVICE_REMINDER', 'service_schedule', scheduleId, 'Marked scheduled service complete'),
    }))
  }

  const addSmallIssue = (
    payload: Omit<SmallIssueLog, 'id' | 'organizationId' | 'reportedAt' | 'reportedBy' | 'status'>,
  ): SmallIssueLog => {
    assertRolePermission(activeRole, 'report_issue')
    const issue: SmallIssueLog = {
      ...payload,
      id: `iss-${Date.now()}`,
      organizationId: activeOrganization.id,
      status: 'open',
      reportedBy: user?.fullName ?? 'Fleet Operations',
      reportedAt: new Date().toISOString(),
    }
    commitDataset((prev) => ({
      ...prev,
      smallIssues: [issue, ...prev.smallIssues],
      auditLogs: appendAudit(prev.auditLogs, 'LOGGED_SMALL_ISSUE', 'small_issue', issue.id, issue.title),
    }))
    return issue
  }

  const createWorkOrder = (payload: {
    vehicleId: string
    title: string
    description: string
    healthArea: FiveAreaHealthCategory
    priority: WorkOrder['priority']
    workshopId?: string
    workshopName: string
    laborCostInr: number
    scheduledFor?: string
    tasks?: string[]
  }): WorkOrder => {
    assertRolePermission(activeRole, 'manage_work_orders')
    const wo: WorkOrder = {
      id: `wo-${Date.now()}`,
      organizationId: activeOrganization.id,
      workOrderNumber: `WO-${activeOrganization.code.split('-')[0] || 'DM'}-${Math.floor(1000 + Math.random() * 8999)}`,
      vehicleId: payload.vehicleId,
      workshopId: payload.workshopId,
      workshopName: payload.workshopName.trim() || 'In-House Depot Bay',
      title: payload.title.trim(),
      description: payload.description.trim(),
      healthArea: payload.healthArea,
      priority: payload.priority,
      status: 'open',
      linkedIssueIds: [],
      tasks: (payload.tasks ?? ['Inspect component wear', 'Verify repair & safety checklist']).map((t, idx) => ({
        id: `tsk-${Date.now()}-${idx}`,
        title: t,
        completed: false,
      })),
      parts: [],
      laborCostInr: Math.max(0, Math.round(payload.laborCostInr)),
      partsCostInr: 0,
      totalCostInr: Math.max(0, Math.round(payload.laborCostInr)),
      paymentState: 'recorded',
      createdBy: user?.fullName ?? 'Maintenance Lead',
      createdAt: new Date().toISOString(),
      scheduledFor: payload.scheduledFor,
    }
    commitDataset((prev) => ({
      ...prev,
      workOrders: [wo, ...prev.workOrders],
      auditLogs: appendAudit(prev.auditLogs, 'CREATED_WORK_ORDER', 'work_order', wo.id, `Created ${wo.workOrderNumber}: ${wo.title}`),
    }))
    return wo
  }

  const addPlace = (payload: Omit<PlaceRecord, 'id' | 'organizationId'>): PlaceRecord => {
    assertRolePermission(activeRole, 'update_org_settings')
    const item: PlaceRecord = { ...payload, id: `pl-${Date.now()}`, organizationId: activeOrganization.id }
    commitDataset((prev) => ({
      ...prev,
      places: [item, ...(prev.places ?? [])],
      auditLogs: appendAudit(prev.auditLogs, 'ADDED_PLACE', 'place', item.id, `Added place ${item.name}`),
    }))
    return item
  }

  const removePlace = (placeId: string) => {
    assertRolePermission(activeRole, 'update_org_settings')
    commitDataset((prev) => ({
      ...prev,
      places: (prev.places ?? []).filter((pl) => !(pl.id === placeId && pl.organizationId === activeOrganization.id)),
      auditLogs: appendAudit(prev.auditLogs, 'REMOVED_PLACE', 'place', placeId, 'Removed place'),
    }))
  }

  const convertIssueToWorkOrder = (issueId: string, workshopId?: string, laborCostInr = 2500): WorkOrder | null => {
    assertRolePermission(activeRole, 'manage_work_orders')
    const issue = smallIssues.find((i) => i.id === issueId)
    if (!issue) return null
    const workshop = workshops.find((w) => w.id === workshopId) ?? workshops[0]
    const wo: WorkOrder = {
      id: `wo-${Date.now()}`,
      organizationId: activeOrganization.id,
      workOrderNumber: `WO-${activeOrganization.code.split('-')[0] || 'DM'}-${Math.floor(1000 + Math.random() * 8999)}`,
      vehicleId: issue.vehicleId,
      workshopId: workshop?.id,
      workshopName: workshop?.name ?? 'Authorized Workshop',
      title: issue.title,
      description: issue.description,
      healthArea: issue.healthArea,
      priority: issue.severity,
      status: 'open',
      linkedIssueIds: [issue.id],
      tasks: [
        { id: `tsk-${Date.now()}-1`, title: `Diagnose ${issue.title}`, completed: false },
        { id: `tsk-${Date.now()}-2`, title: 'Complete workshop quality check', completed: false },
      ],
      parts: [],
      laborCostInr,
      partsCostInr: 0,
      totalCostInr: laborCostInr,
      paymentState: 'recorded',
      createdBy: user?.fullName ?? 'Fleet Operations',
      createdAt: new Date().toISOString(),
    }
    commitDataset((prev) => ({
      ...prev,
      workOrders: [wo, ...prev.workOrders],
      smallIssues: prev.smallIssues.map((s) =>
        s.id === issueId ? { ...s, status: 'converted_to_wo', linkedWorkOrderId: wo.id } : s,
      ),
      auditLogs: appendAudit(prev.auditLogs, 'CONVERTED_ISSUE_TO_WO', 'work_order', wo.id, `Escalated issue ${issue.id} to ${wo.workOrderNumber}`),
    }))
    return wo
  }

  const updateWorkOrderStatus = (workOrderId: string, status: WorkOrderStatus) => {
    assertRolePermission(activeRole, 'manage_work_orders')
    const nowIso = new Date().toISOString()
    commitDataset((prev) => {
      const target = prev.workOrders.find((w) => w.id === workOrderId && w.organizationId === activeOrganization.id)
      if (!target) return prev
      const completedAt = status === 'completed' || status === 'closed' ? target.completedAt ?? nowIso : target.completedAt
      return {
        ...prev,
        workOrders: prev.workOrders.map((w) =>
          w.id === workOrderId && w.organizationId === activeOrganization.id
            ? { ...w, status, completedAt }
            : w,
        ),
        smallIssues:
          status === 'completed' || status === 'closed'
            ? prev.smallIssues.map((s) =>
                s.linkedWorkOrderId === workOrderId ? { ...s, status: 'resolved' } : s,
              )
            : prev.smallIssues,
        auditLogs: appendAudit(prev.auditLogs, 'UPDATED_WORK_ORDER', 'work_order', workOrderId, `Work Order moved to ${status}`),
      }
    })
  }

  const addWorkOrderPart = (workOrderId: string, partId: string, quantity: number) => {
    assertRolePermission(activeRole, 'manage_work_orders')
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error('Quantity must be greater than zero.')
    }
    const part = partsInventory.find((p) => p.id === partId)
    if (!part) throw new Error('Selected spare part SKU not found.')
    if (part.stockQty < quantity) {
      throw new Error(`Insufficient stock for ${part.name} (${part.stockQty} available, ${quantity} requested).`)
    }
    const nowIso = new Date().toISOString()
    const lineCost = Math.round(part.unitCostInr * quantity)
    const nextBalance = part.stockQty - quantity

    commitDataset((prev) => {
      const wo = prev.workOrders.find((w) => w.id === workOrderId && w.organizationId === activeOrganization.id)
      if (!wo) return prev
      const tx: InventoryTransaction = {
        id: `itx-${Date.now()}`,
        organizationId: activeOrganization.id,
        partId: part.id,
        partName: part.name,
        type: 'wo_consume',
        quantityDelta: -quantity,
        balanceAfter: nextBalance,
        referenceType: 'work_order',
        referenceId: wo.workOrderNumber,
        performedBy: user?.fullName ?? 'Workshop Lead',
        timestamp: nowIso,
      }
      const nextParts = [
        ...wo.parts,
        {
          partId: part.id,
          partName: part.name,
          sku: part.sku,
          quantity,
          unitCostInr: part.unitCostInr,
          totalCostInr: lineCost,
          consumedFromStock: true,
        },
      ]
      const nextPartsCost = nextParts.reduce((s, l) => s + l.totalCostInr, 0)
      return {
        ...prev,
        partsInventory: prev.partsInventory.map((p) =>
          p.id === partId ? { ...p, stockQty: nextBalance, updatedAt: nowIso } : p,
        ),
        inventoryTransactions: [tx, ...prev.inventoryTransactions],
        workOrders: prev.workOrders.map((w) =>
          w.id === workOrderId
            ? {
                ...w,
                parts: nextParts,
                partsCostInr: nextPartsCost,
                totalCostInr: w.laborCostInr + nextPartsCost,
              }
            : w,
        ),
        auditLogs: appendAudit(
          prev.auditLogs,
          'CONSUMED_WO_PART',
          'work_order',
          workOrderId,
          `Allocated ${quantity} × ${part.sku} to ${wo.workOrderNumber}`,
        ),
      }
    })
  }

  const addPartInventory = (payload: Omit<PartInventoryItem, 'id' | 'organizationId' | 'updatedAt'>): PartInventoryItem => {
    assertRolePermission(activeRole, 'manage_inventory')
    if (!payload.sku.trim() || !payload.name.trim()) {
      throw new Error('Part SKU and name are required.')
    }
    const item: PartInventoryItem = {
      ...payload,
      id: `prt-${Date.now()}`,
      organizationId: activeOrganization.id,
      sku: payload.sku.trim().toUpperCase(),
      name: payload.name.trim(),
      updatedAt: new Date().toISOString(),
    }
    commitDataset((prev) => ({
      ...prev,
      partsInventory: [item, ...prev.partsInventory],
      auditLogs: appendAudit(prev.auditLogs, 'ADDED_PART', 'part_inventory', item.id, `Added SKU ${item.sku} (${item.stockQty} ${item.unit})`),
    }))
    return item
  }

  const adjustPartStock = (partId: string, quantityDelta: number, reason: string) => {
    assertRolePermission(activeRole, 'manage_inventory')
    const part = partsInventory.find((p) => p.id === partId)
    if (!part) return
    const nextQty = Math.max(0, part.stockQty + quantityDelta)
    const nowIso = new Date().toISOString()
    const tx: InventoryTransaction = {
      id: `itx-${Date.now()}`,
      organizationId: activeOrganization.id,
      partId: part.id,
      partName: part.name,
      type: 'manual_adjust',
      quantityDelta,
      balanceAfter: nextQty,
      referenceType: 'audit',
      referenceId: reason.trim() || 'Stock Adjustment',
      performedBy: user?.fullName ?? 'Inventory Manager',
      timestamp: nowIso,
    }
    commitDataset((prev) => ({
      ...prev,
      partsInventory: prev.partsInventory.map((p) =>
        p.id === partId ? { ...p, stockQty: nextQty, updatedAt: nowIso } : p,
      ),
      inventoryTransactions: [tx, ...prev.inventoryTransactions],
      auditLogs: appendAudit(prev.auditLogs, 'ADJUSTED_STOCK', 'part_inventory', partId, `${part.sku}: ${quantityDelta >= 0 ? '+' : ''}${quantityDelta} (${reason})`),
    }))
  }

  const createPurchaseOrder = (payload: {
    supplierId: string
    items: Array<{ partId: string; orderedQty: number }>
    expectedAt?: string
  }): PurchaseOrder => {
    assertRolePermission(activeRole, 'manage_inventory')
    const supplier = suppliers.find((s) => s.id === payload.supplierId) ?? suppliers[0]
    if (!supplier) throw new Error('Select a valid supplier.')
    const lineItems = payload.items
      .filter((i) => i.orderedQty > 0)
      .map((i) => {
        const part = partsInventory.find((p) => p.id === i.partId)
        if (!part) throw new Error(`Part ${i.partId} not found.`)
        return {
          partId: part.id,
          partName: part.name,
          sku: part.sku,
          orderedQty: i.orderedQty,
          receivedQty: 0,
          unitCostInr: part.unitCostInr,
        }
      })
    if (lineItems.length === 0) throw new Error('Add at least one item with positive quantity.')
    const totalAmountInr = lineItems.reduce((s, l) => s + l.orderedQty * l.unitCostInr, 0)
    const po: PurchaseOrder = {
      id: `po-${Date.now()}`,
      organizationId: activeOrganization.id,
      poNumber: `PO-${activeOrganization.code.split('-')[0] || 'DM'}-${Math.floor(1000 + Math.random() * 8999)}`,
      supplierId: supplier.id,
      supplierName: supplier.name,
      status: 'issued',
      items: lineItems,
      totalAmountInr,
      paymentState: 'recorded',
      createdAt: new Date().toISOString(),
      expectedAt: payload.expectedAt,
    }
    commitDataset((prev) => ({
      ...prev,
      purchaseOrders: [po, ...prev.purchaseOrders],
      auditLogs: appendAudit(prev.auditLogs, 'CREATED_PO', 'purchase_order', po.id, `Issued ${po.poNumber} to ${supplier.name}`),
    }))
    return po
  }

  const receivePurchaseOrderItems = (poId: string, receivedMap: Record<string, number>) => {
    assertRolePermission(activeRole, 'manage_inventory')
    const po = purchaseOrders.find((p) => p.id === poId)
    if (!po) return
    const nowIso = new Date().toISOString()

    commitDataset((prev) => {
      const newTxs: InventoryTransaction[] = []
      const updatedParts = [...prev.partsInventory]
      const updatedPoItems = po.items.map((item) => {
        const addQty = Math.max(0, Math.min(item.orderedQty - item.receivedQty, receivedMap[item.partId] ?? 0))
        if (addQty > 0) {
          const pIdx = updatedParts.findIndex((p) => p.id === item.partId && p.organizationId === activeOrganization.id)
          if (pIdx >= 0) {
            const nextBal = updatedParts[pIdx].stockQty + addQty
            updatedParts[pIdx] = { ...updatedParts[pIdx], stockQty: nextBal, updatedAt: nowIso }
            newTxs.push({
              id: `itx-${Date.now()}-${item.partId}`,
              organizationId: activeOrganization.id,
              partId: item.partId,
              partName: item.partName,
              type: 'po_receive',
              quantityDelta: addQty,
              balanceAfter: nextBal,
              referenceType: 'purchase_order',
              referenceId: po.poNumber,
              performedBy: user?.fullName ?? 'Inventory Clerk',
              timestamp: nowIso,
            })
          }
        }
        return { ...item, receivedQty: item.receivedQty + addQty }
      })

      const allReceived = updatedPoItems.every((i) => i.receivedQty >= i.orderedQty)
      const anyReceived = updatedPoItems.some((i) => i.receivedQty > 0)
      const nextStatus: PurchaseOrder['status'] = allReceived
        ? 'received'
        : anyReceived
          ? 'partially_received'
          : po.status

      return {
        ...prev,
        partsInventory: updatedParts,
        inventoryTransactions: [...newTxs, ...prev.inventoryTransactions],
        purchaseOrders: prev.purchaseOrders.map((p) =>
          p.id === poId ? { ...p, items: updatedPoItems, status: nextStatus } : p,
        ),
        auditLogs: appendAudit(prev.auditLogs, 'RECEIVED_PO_ITEMS', 'purchase_order', poId, `Received stock against ${po.poNumber} (${nextStatus})`),
      }
    })
  }

  const addWorkshop = (
    payload: Omit<WorkshopVendor, 'id' | 'organizationId' | 'completedJobsCount' | 'totalSpendInr'>,
  ): WorkshopVendor => {
    assertRolePermission(activeRole, 'manage_workshops')
    const ws: WorkshopVendor = {
      ...payload,
      id: `ws-${Date.now()}`,
      organizationId: activeOrganization.id,
      completedJobsCount: 0,
      totalSpendInr: 0,
    }
    commitDataset((prev) => ({
      ...prev,
      workshops: [ws, ...prev.workshops],
      auditLogs: appendAudit(prev.auditLogs, 'ADDED_WORKSHOP', 'workshop', ws.id, `Added workshop ${ws.name} (${ws.city})`),
    }))
    return ws
  }

  const addFinancialInvoice = (
    payload: Omit<FinancialInvoice, 'id' | 'organizationId' | 'paidAmountInr' | 'status'>,
  ): FinancialInvoice => {
    assertRolePermission(activeRole, 'manage_financials')
    if (!Number.isFinite(payload.amountInr) || payload.amountInr <= 0) {
      throw new Error('Invoice amount must be greater than ₹0.')
    }
    const inv: FinancialInvoice = {
      ...payload,
      id: `inv-${Date.now()}`,
      organizationId: activeOrganization.id,
      paidAmountInr: 0,
      status: 'recorded',
    }
    commitDataset((prev) => ({
      ...prev,
      invoices: [inv, ...prev.invoices],
      auditLogs: appendAudit(prev.auditLogs, 'RECORDED_INVOICE', 'invoice', inv.id, `Recorded invoice ${inv.invoiceNumber} (₹${inv.amountInr})`),
    }))
    return inv
  }

  const verifyFinancialInvoice = (invoiceId: string) => {
    assertRolePermission(activeRole, 'manage_financials')
    commitDataset((prev) => ({
      ...prev,
      invoices: prev.invoices.map((i) =>
        i.id === invoiceId && i.organizationId === activeOrganization.id && i.status === 'recorded'
          ? { ...i, status: 'verified' }
          : i,
      ),
      auditLogs: appendAudit(prev.auditLogs, 'VERIFIED_INVOICE', 'invoice', invoiceId, 'Verified vendor invoice for payout'),
    }))
  }

  const recordInvoicePayment = (payload: {
    invoiceId: string
    amountInr: number
    paymentMethod: PaymentRecord['paymentMethod']
    referenceNumber: string
  }): PaymentRecord => {
    assertRolePermission(activeRole, 'manage_financials')
    const inv = invoices.find((i) => i.id === payload.invoiceId)
    if (!inv) throw new Error('Invoice not found.')
    if (!Number.isFinite(payload.amountInr) || payload.amountInr <= 0) {
      throw new Error('Payment amount must be greater than ₹0.')
    }
    const remaining = Math.max(0, inv.amountInr - inv.paidAmountInr)
    const payAmt = Math.min(remaining, Math.round(payload.amountInr))
    const nextPaid = inv.paidAmountInr + payAmt
    const nextStatus: FinancialInvoice['status'] = nextPaid >= inv.amountInr ? 'paid' : 'partially_paid'

    const rec: PaymentRecord = {
      id: `pay-${Date.now()}`,
      organizationId: activeOrganization.id,
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      amountInr: payAmt,
      paymentMethod: payload.paymentMethod,
      referenceNumber: payload.referenceNumber.trim() || `TXN-${Date.now().toString().slice(-6)}`,
      paidAt: new Date().toISOString(),
      recordedBy: user?.fullName ?? 'Finance Lead',
    }
    commitDataset((prev) => ({
      ...prev,
      payments: [rec, ...prev.payments],
      invoices: prev.invoices.map((i) =>
        i.id === inv.id ? { ...i, paidAmountInr: nextPaid, status: nextStatus } : i,
      ),
      auditLogs: appendAudit(prev.auditLogs, 'RECORDED_PAYMENT', 'payment', rec.id, `Recorded ₹${payAmt} against ${inv.invoiceNumber}`),
    }))
    return rec
  }

  const uploadDocumentToVault = async (payload: {
    entityType: 'vehicle' | 'driver'
    entityId: string
    category: string
    title: string
    maskedNumber?: string
    issuingAuthority?: string
    issuedDate?: string
    expiryDate?: string
    fileName: string
    mimeType: string
    contentBase64: string
  }): Promise<DocumentVaultItem> => {
    assertRolePermission(activeRole, 'edit_vehicle')
    let doc: DocumentVaultItem
    if (serverHydratedRef.current) {
      const res = await fetch('/api/fleet/documents', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok || !data.document) {
        throw new Error(data.error || 'Document upload failed.')
      }
      doc = data.document as DocumentVaultItem
    } else {
      doc = {
        id: `doc-${Date.now()}`,
        organizationId: activeOrganization.id,
        entityType: payload.entityType,
        entityId: payload.entityId,
        category: payload.category,
        title: payload.title,
        maskedNumber: payload.maskedNumber,
        issuingAuthority: payload.issuingAuthority,
        issuedDate: payload.issuedDate,
        expiryDate: payload.expiryDate,
        fileName: payload.fileName,
        mimeType: payload.mimeType,
        fileSizeBytes: payload.contentBase64.length,
        storageKey: `${activeOrganization.id}/${payload.fileName}`,
        verificationStatus: 'pending_verification',
        uploadedBy: user?.fullName ?? 'Operations Admin',
        uploadedAt: new Date().toISOString(),
      }
    }

    commitDataset((prev) => ({
      ...prev,
      documentVault: [doc, ...prev.documentVault],
      auditLogs: appendAudit(prev.auditLogs, 'UPLOADED_DOCUMENT', 'document_vault', doc.id, `Uploaded ${doc.title} (Pending Verification)`),
    }))
    return doc
  }

  const verifyVaultDocument = (docId: string, status: 'verified' | 'rejected', rejectionReason?: string) => {
    assertRolePermission(activeRole, 'verify_documents')
    const nowIso = new Date().toISOString()
    commitDataset((prev) => ({
      ...prev,
      documentVault: prev.documentVault.map((d) =>
        d.id === docId && d.organizationId === activeOrganization.id
          ? {
              ...d,
              verificationStatus: status,
              verifiedBy: user?.fullName ?? 'Compliance Reviewer',
              verifiedAt: nowIso,
              rejectionReason: status === 'rejected' ? rejectionReason?.trim() || 'Document unclear or expired' : undefined,
            }
          : d,
      ),
      auditLogs: appendAudit(prev.auditLogs, 'VERIFIED_DOCUMENT', 'document_vault', docId, `Document ${status}`),
    }))
  }

  const updateTyrePosition = (tyreId: string, patch: Partial<TyrePositionRecord>) => {
    assertRolePermission(activeRole, 'schedule_maintenance')
    commitDataset((prev) => ({
      ...prev,
      tyrePositions: prev.tyrePositions.map((t) => (t.id === tyreId ? { ...t, ...patch } : t)),
    }))
  }

  const markAlertRead = (alertId: string) => {
    commitDataset((prev) => ({
      ...prev,
      alerts: prev.alerts.map((a) =>
        a.id === alertId && a.organizationId === activeOrganization.id ? { ...a, read: true } : a,
      ),
    }))
  }

  const markAllAlertsRead = () => {
    commitDataset((prev) => ({
      ...prev,
      alerts: prev.alerts.map((a) =>
        a.organizationId === activeOrganization.id ? { ...a, read: true } : a,
      ),
    }))
  }

  const acknowledgeAlert = (alertId: string) => {
    assertRolePermission(activeRole, 'acknowledge_alert')
    commitDataset((prev) => ({
      ...prev,
      alerts: prev.alerts.map((a) =>
        a.id === alertId && a.organizationId === activeOrganization.id
          ? { ...a, read: true, acknowledged: true }
          : a,
      ),
      auditLogs: appendAudit(prev.auditLogs, 'ACKNOWLEDGED_ALERT', 'alert', alertId, 'Acknowledged operational alert'),
    }))
  }

  const updateSubscriptionPlan = (planId: SubscriptionPlanId) => {
    assertRolePermission(activeRole, 'manage_subscription')
    const spec = SUBSCRIPTION_PLANS.find((p) => p.id === planId) ?? SUBSCRIPTION_PLANS[0]
    commitDataset((prev) => ({
      ...prev,
      organizations: prev.organizations.map((o) =>
        o.id === activeOrganization.id
          ? { ...o, planId, vehicleLimit: spec.vehicleLimit, driverLimit: spec.driverLimit }
          : o,
      ),
      auditLogs: appendAudit(prev.auditLogs, 'UPDATED_SUBSCRIPTION', 'organization', activeOrganization.id, `Changed subscription tier to ${spec.name}`),
    }))
  }

  const updateOrganizationProfile = (patch: Partial<Pick<Organization, 'name' | 'city' | 'state' | 'timezone'>>) => {
    assertRolePermission(activeRole, 'update_org_settings')
    commitDataset((prev) => ({
      ...prev,
      organizations: prev.organizations.map((o) =>
        o.id === activeOrganization.id ? { ...o, ...patch } : o,
      ),
      auditLogs: appendAudit(prev.auditLogs, 'UPDATED_ORG_SETTINGS', 'organization', activeOrganization.id, 'Updated organization configuration'),
    }))
  }

  const updateSettings = (patch: Partial<WorkspaceSettings>) => {
    assertRolePermission(activeRole, 'update_org_settings')
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
      } catch {
        // ignore
      }
      return next
    })
  }

  const recordReportGeneration = (
    entry: Omit<ReportHistoryItem, 'id' | 'organizationId' | 'environment' | 'generatedAt'>,
  ) => {
    assertRolePermission(activeRole, 'export_reports')
    const item: ReportHistoryItem = {
      ...entry,
      id: `rep-${Date.now()}`,
      organizationId: activeOrganization.id,
      environment,
      generatedAt: new Date().toISOString(),
    }
    commitDataset((prev) => ({
      ...prev,
      reports: [item, ...prev.reports],
      auditLogs: appendAudit(prev.auditLogs, 'GENERATED_REPORT', 'report', item.id, `Exported ${item.title} (${item.format})`),
    }))
  }

  const updateTelemetryState = (vehicleId: string, patch: Partial<Vehicle['telemetry']>) => {
    assertRolePermission(activeRole, 'update_telemetry')
    if (patch.location && !isValidCoordinate(patch.location.lat, patch.location.lng)) return
    commitDataset((prev) => ({
      ...prev,
      vehicles: prev.vehicles.map((v) => {
        if (v.id !== vehicleId || v.organizationId !== activeOrganization.id) return v
        if (patch.lastUpdatedAt && isStaleOutOfOrderTimestamp(patch.lastUpdatedAt, v.telemetry.lastUpdatedAt)) {
          return v
        }
        return { ...v, telemetry: { ...v.telemetry, ...patch } }
      }),
    }))
  }

  const value: FleetContextValue = {
    environment,
    organizations: dataset.organizations,
    activeOrganization,
    setActiveOrganizationId,
    activeRole,
    setActiveRole,
    reportingPeriod,
    setReportingPeriod,
    searchTerm,
    setSearchTerm,
    simulationActive,
    toggleSimulation: () => setSimulationActive((s) => !s),
    refreshStatus,
    lastRefreshedAt,
    refreshIntelligence,
    corridors: REGIONAL_CORRIDORS,
    members,
    inviteMember,
    updateMemberRole,
    vehicles,
    archivedVehicles,
    allOrgVehiclesCount: vehicles.length,
    drivers,
    driverEvents,
    driverAssignments,
    trips,
    fuelTransactions,
    maintenanceRecords,
    inspections,
    serviceSchedules,
    smallIssues,
    places,
    workOrders,
    partsInventory,
    suppliers,
    purchaseOrders,
    inventoryTransactions,
    workshops,
    invoices,
    payments,
    documentVault,
    tyrePositions,
    alerts,
    predictions,
    riskAssessments,
    financialSummary,
    financialLedgerSummary,
    auditLogs,
    reports,
    settings,
    updateSettings,
    updateOrganizationProfile,
    unreadAlertCount,
    nowTick: predictionTick,
    addVehicle,
    updateVehicle,
    decommissionVehicle,
    restoreVehicle,
    assignDriverToVehicle,
    addDriver,
    updateDriverDetails,
    updateDriverOperationalStatus,
    disputeDriverEvent,
    resolveDriverEventDispute,
    startTrip,
    endTrip,
    scheduleTrip,
    syncOfflineTrips,
    addFuelTransaction,
    verifyFuelTransaction,
    scheduleMaintenance,
    completeMaintenance,
    resolvePrediction,
    recalculatePredictions,
    submitVehicleInspection,
    addServiceSchedule,
    completeServiceSchedule,
    addPlace,
    removePlace,
    addSmallIssue,
    convertIssueToWorkOrder,
    createWorkOrder,
    updateWorkOrderStatus,
    addWorkOrderPart,
    addPartInventory,
    adjustPartStock,
    createPurchaseOrder,
    receivePurchaseOrderItems,
    addWorkshop,
    addFinancialInvoice,
    verifyFinancialInvoice,
    recordInvoicePayment,
    uploadDocumentToVault,
    verifyVaultDocument,
    updateTyrePosition,
    markAlertRead,
    markAllAlertsRead,
    acknowledgeAlert,
    updateSubscriptionPlan,
    recordReportGeneration,
    updateTelemetryState,
    resetCurrentEnvironment,
  }

  return <FleetContext.Provider value={value}>{children}</FleetContext.Provider>
}

export function useFleet() {
  const ctx = useContext(FleetContext)
  if (!ctx) throw new Error('useFleet must be used within FleetProvider')
  return ctx
}
