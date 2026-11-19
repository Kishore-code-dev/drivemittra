export type OperatingEnvironment = 'production'

export type OrganizationRole =
  | 'platform_admin'
  | 'org_admin'
  | 'fleet_manager'
  | 'maintenance'
  | 'finance'
  | 'viewer'

export type OrganizationStatus =
  | 'active'
  | 'payment_pending'
  | 'grace_period'
  | 'suspended'
  | 'terminated'
  | 'archived'

export type SubscriptionPlanId = 'starter' | 'growth' | 'enterprise'

export type ReportingPeriod = '7d' | '30d' | '90d'

export type FuelType = 'Diesel' | 'Petrol' | 'CNG' | 'Electric'
export type PowertrainType = 'ICE' | 'EV'

export type VehicleCategory =
  | 'Light Commercial'
  | 'Medium Truck'
  | 'Heavy Truck'
  | 'Delivery Van'
  | 'Electric Cargo'

export type VehicleOperationStatus =
  | 'moving'
  | 'idle'
  | 'stopped'
  | 'offline'
  | 'delayed'
  | 'maintenance'

export type TelemetryFreshness = 'live' | 'delayed' | 'stale' | 'offline'

export type RefreshStatus =
  | 'idle'
  | 'refreshing'
  | 'updated'
  | 'partially_updated'
  | 'no_new_data'
  | 'failed'

export type RiskSeverity = 'critical' | 'high' | 'moderate' | 'normal'

export type RiskCategory =
  | 'maintenance'
  | 'driver_safety'
  | 'fuel'
  | 'telemetry'
  | 'trip_exceptions'
  | 'compliance_expiry'
  | 'inspection_defects'
  | 'climate_corridor'
  | 'inventory_shortage'
  | 'financial_variance'

export type FiveAreaHealthCategory =
  | 'Fuel Health'
  | 'Engine Health'
  | 'Tyre Health'
  | 'Driver Health'
  | 'Vehicle Health'

export type ComponentCategory =
  | 'Engine'
  | 'Brakes'
  | 'Tyres'
  | 'Battery'
  | 'Suspension'
  | 'Transmission'
  | 'Cooling System'
  | 'EV Battery'

export interface LatLng {
  lat: number
  lng: number
}

export interface Organization {
  id: string
  name: string
  code: string
  city: string
  state: string
  timezone: string
  currency: 'INR'
  planId: SubscriptionPlanId
  vehicleLimit: number
  driverLimit: number
  status: OrganizationStatus
  paymentStatus: 'paid' | 'pending' | 'overdue' | 'grace' | 'cancelled'
  subscriptionStartDate: string
  subscriptionExpiryDate: string
  gracePeriodUntil?: string
  suspensionReason?: string
  ownerName?: string
  ownerEmail?: string
  ownerPhone?: string
  gstin?: string
  createdAt: string
  environment: OperatingEnvironment
}

export interface OrganizationMember {
  id: string
  organizationId: string
  userId: string
  username?: string
  fullName: string
  email: string
  role: OrganizationRole
  status: 'active' | 'invited' | 'suspended'
  lastActiveAt: string
}

export interface RegionalCorridor {
  id: string
  name: string
  region: string
  roadStressIndex: number
  climateImpactScore: number
  potholeDensity: 'low' | 'moderate' | 'high'
  avgAmbientTempC: number
}

export interface VehicleComponent {
  id: string
  vehicleId: string
  componentName: ComponentCategory
  healthScore: number
  status: 'healthy' | 'at-risk' | 'critical'
  wearRatePer1000Km: number
  lastServicedAt: string
  predictedReplacementDate: string
  notes: string
}

export interface VehicleTechnicalSpecs {
  heightMeters: number
  widthMeters: number
  lengthMeters: number
  grossVehicleWeightKg: number
  axleCount: number
  payloadCapacityKg: number
  cargoType: string
  hazmatClass?: string
  chassisNumber?: string
  engineNumber?: string
  emissionNorm?: 'BS-VI' | 'BS-IV' | 'EV-Zero'
}

export type DocumentVerificationStatus =
  | 'uploaded'
  | 'pending_verification'
  | 'verified'
  | 'rejected'
  | 'expired'

export interface DocumentVaultItem {
  id: string
  organizationId: string
  entityType: 'vehicle' | 'driver'
  entityId: string
  category: string
  title: string
  documentNumber?: string
  maskedNumber?: string
  issuingAuthority?: string
  issuedDate?: string
  expiryDate?: string
  fileName: string
  mimeType: string
  fileSizeBytes: number
  storageKey: string
  verificationStatus: DocumentVerificationStatus
  verifiedBy?: string
  verifiedAt?: string
  rejectionReason?: string
  uploadedBy: string
  uploadedAt: string
}

export interface TelemetrySnapshot {
  vehicleId: string
  location: LatLng
  cityLabel: string
  speedKmh: number
  heading: number
  gpsAccuracyMeters: number
  signalQualityPct: number
  connectionState: 'connected' | 'intermittent' | 'disconnected'
  source: 'smartphone_gps' | 'hybrid_obd' | 'simulated'
  lastUpdatedAt: string
  batteryLevelPct?: number
  motionPermissionGranted: boolean
}

export interface VehicleFiveAreaHealth {
  fuelHealth: { score: number; status: 'healthy' | 'at-risk' | 'critical' | 'insufficient_data'; detail: string }
  engineHealth: { score: number; status: 'healthy' | 'at-risk' | 'critical' | 'insufficient_data'; detail: string }
  tyreHealth: { score: number; status: 'healthy' | 'at-risk' | 'critical' | 'insufficient_data'; detail: string }
  driverHealth: { score: number; status: 'healthy' | 'at-risk' | 'critical' | 'insufficient_data'; detail: string }
  vehicleHealth: { score: number; status: 'healthy' | 'at-risk' | 'critical' | 'insufficient_data'; detail: string }
}

export interface TyrePositionRecord {
  id: string
  vehicleId: string
  position: string // e.g., 'FL', 'FR', 'RL-Outer', 'RL-Inner', 'RR-Outer', 'RR-Inner'
  brand: string
  serialNumber: string
  treadDepthMm: number
  installedAtOdometerKm: number
  expectedLifeKm: number
  status: 'healthy' | 'wear_watch' | 'replace_soon'
  lastInspectedAt: string
}

export interface Vehicle {
  id: string
  organizationId: string
  environment: OperatingEnvironment
  registrationNumber: string
  make: string
  model: string
  category: VehicleCategory
  powertrain: PowertrainType
  fuelType: FuelType
  year: number
  assignedDriverId: string | null
  odometerKm: number
  dailyAvgKm: number
  healthScore: number
  operationStatus: VehicleOperationStatus
  fuelOrSocPct: number
  corridorId: string
  cityName: string
  registrationExpiry: string
  insuranceExpiry: string
  insuranceProvider: string
  fitnessExpiry?: string
  pucExpiry?: string
  permitExpiry?: string
  lastServiceDate: string
  nextServiceDueDate: string
  nextServiceDueOdometerKm?: number
  monthlyRevenueInr: number
  specs?: VehicleTechnicalSpecs
  telemetry: TelemetrySnapshot
  components: VehicleComponent[]
  decommissioned?: boolean
}

export interface DriverBehaviorEvent {
  id: string
  organizationId: string
  driverId: string
  vehicleId: string
  tripId: string
  eventType:
    | 'harsh_braking'
    | 'rapid_acceleration'
    | 'overspeeding'
    | 'sharp_cornering'
    | 'extended_driving'
  severity: 'low' | 'medium' | 'high'
  speedKmh: number
  roadStressContext: number
  gpsAccuracyMeters: number
  mountStabilityWarning: boolean
  timestamp: string
  locationLabel: string
  disputeStatus: 'none' | 'disputed' | 'accepted_dismissed' | 'rejected_upheld'
  disputeReason?: string
  disputeResolutionNote?: string
}

export type IndianLicenseCategory = 'LMV-TR' | 'TRANS' | 'HGMV' | 'HPMV' | 'HTV' | 'MGV'

export type DriverOperationalStatus = 'active' | 'inactive' | 'suspended' | 'archived'

export interface DriverAssignmentHistoryItem {
  id: string
  organizationId: string
  driverId: string
  vehicleId: string
  vehicleRegistration: string
  assignedAt: string
  unassignedAt?: string
  assignedBy: string
  notes?: string
}

export interface Driver {
  id: string
  organizationId: string
  environment: OperatingEnvironment
  employeeCode?: string
  name: string
  mobile: string
  alternateMobile?: string
  email: string
  dateOfBirth?: string
  city?: string
  state?: string
  address?: string
  bloodGroup?: string
  emergencyContactName?: string
  emergencyContactRelation?: string
  emergencyContactPhone?: string
  licenseNumber: string
  licenseCategories?: IndianLicenseCategory[]
  licenseIssuingRto?: string
  licenseIssueDate?: string
  licenseExpiry: string
  hazmatEndorsed?: boolean
  hazmatExpiry?: string
  aadhaarMasked?: string
  panMasked?: string
  medicalFitnessExpiry?: string
  policeVerificationStatus?: 'pending' | 'verified' | 'expired' | 'not_submitted'
  digilockerStatus?: 'not_connected' | 'disabled_by_admin' | 'verified' | 'error'
  assignedVehicleId: string | null
  operationalStatus: DriverOperationalStatus
  status: 'on_trip' | 'available' | 'off_duty' | 'suspended' | 'archived'
  safetyScore: number
  speedingScore: number
  brakingScore: number
  accelerationScore: number
  corneringScore: number
  fatigueComplianceScore: number
  totalTrips: number
  totalDistanceKm: number
  joinDate: string
  coachingRecommendations: string[]
  dataConfidenceNote: string
}

export interface TripStop {
  id: string
  tripId: string
  location: LatLng
  address: string
  startTime: string
  endTime?: string
  durationMinutes: number
  reason: 'fuel' | 'loading' | 'rest' | 'traffic' | 'unplanned'
  flaggedForReview: boolean
}

export interface TripSpeedPoint {
  minuteOffset: number
  label: string
  speedKmh: number
}

export interface Trip {
  id: string
  organizationId: string
  environment: OperatingEnvironment
  vehicleId: string
  driverId: string
  originAddress: string
  destinationAddress: string
  startLocation: LatLng
  endLocation?: LatLng
  startTime: string
  endTime?: string
  distanceKm: number
  plannedDistanceKm?: number
  durationMinutes: number
  plannedDurationMinutes?: number
  avgSpeedKmh: number
  maxSpeedKmh: number
  status: 'scheduled' | 'active' | 'completed' | 'delayed' | 'interrupted'
  truckRoutingMode?: 'google_truck_verified' | 'google_truck_partial_restrictions' | 'highway_geometry_unverified'
  route: LatLng[]
  speedTimeline: TripSpeedPoint[]
  stops: TripStop[]
  offlineSynced?: boolean
}

export interface FuelTransaction {
  id: string
  organizationId: string
  environment: OperatingEnvironment
  vehicleId: string
  driverId: string
  tripId?: string
  amountInr: number
  litersOrKwh: number
  unitPriceInr: number
  odometerKm: number
  station: string
  location: LatLng
  timestamp: string
  paymentMethod: 'upi' | 'fleet_card' | 'cash' | 'ev_charging'
  entrySource: 'owner_entry' | 'receipt_ocr' | 'station_feed'
  verificationStatus: 'verified' | 'pending' | 'needs_review'
  paymentState?: 'recorded' | 'verified' | 'paid'
  anomalyFlags: string[]
  efficiencyKmPerUnit?: number
  costPerKmInr?: number
}

export interface MaintenanceRecord {
  id: string
  organizationId: string
  environment: OperatingEnvironment
  vehicleId: string
  serviceType: string
  componentName: ComponentCategory | 'General Service'
  serviceCenter: string
  workshopId?: string
  description: string
  costInr: number
  paymentState?: 'recorded' | 'verified' | 'paid'
  billNumber?: string
  billFileName?: string
  downtimeDays: number
  partsReplaced: string[]
  performedAt: string
  odometerAtServiceKm?: number
  status: 'scheduled' | 'in_progress' | 'completed'
  linkedPredictionId?: string
  linkedWorkOrderId?: string
}

export interface ServiceScheduleReminder {
  id: string
  organizationId: string
  vehicleId: string
  title: string
  healthArea: FiveAreaHealthCategory
  intervalDays: number
  intervalKm: number
  dueDate: string
  dueOdometerKm: number
  priority: 'low' | 'medium' | 'high' | 'critical'
  status: 'upcoming' | 'due_soon' | 'overdue' | 'completed'
}

export interface SmallIssueLog {
  id: string
  organizationId: string
  vehicleId: string
  driverId?: string
  title: string
  description: string
  healthArea: FiveAreaHealthCategory
  severity: 'low' | 'medium' | 'high' | 'critical'
  status: 'open' | 'triaged' | 'converted_to_wo' | 'resolved'
  source: 'owner_manual' | 'inspection_defect' | 'predictive_alert'
  reportedBy: string
  reportedAt: string
  linkedWorkOrderId?: string
}

export type WorkOrderStatus =
  | 'draft'
  | 'open'
  | 'approved'
  | 'in_progress'
  | 'waiting_parts'
  | 'completed'
  | 'closed'

export interface WorkOrderPartLine {
  partId: string
  partName: string
  sku: string
  quantity: number
  unitCostInr: number
  totalCostInr: number
  consumedFromStock: boolean
}

export interface WorkOrder {
  id: string
  organizationId: string
  workOrderNumber: string
  vehicleId: string
  workshopId?: string
  workshopName: string
  title: string
  description: string
  healthArea: FiveAreaHealthCategory
  priority: 'low' | 'medium' | 'high' | 'critical'
  status: WorkOrderStatus
  linkedIssueIds: string[]
  tasks: Array<{ id: string; title: string; completed: boolean }>
  parts: WorkOrderPartLine[]
  laborCostInr: number
  partsCostInr: number
  totalCostInr: number
  paymentState: 'recorded' | 'verified' | 'paid'
  createdBy: string
  createdAt: string
  scheduledFor?: string
  completedAt?: string
}

export interface PartInventoryItem {
  id: string
  organizationId: string
  sku: string
  name: string
  category: FiveAreaHealthCategory | 'Consumables' | 'Safety'
  unit: string
  stockQty: number
  reorderThreshold: number
  unitCostInr: number
  preferredSupplierId?: string
  warehouseLocation: string
  updatedAt: string
}

export interface SupplierRecord {
  id: string
  organizationId: string
  name: string
  gstin?: string
  city: string
  contactName: string
  phone: string
  email: string
  leadTimeDays: number
  rating: number
}

export interface PurchaseOrder {
  id: string
  organizationId: string
  poNumber: string
  supplierId: string
  supplierName: string
  status: 'draft' | 'issued' | 'partially_received' | 'received' | 'cancelled'
  items: Array<{
    partId: string
    partName: string
    sku: string
    orderedQty: number
    receivedQty: number
    unitCostInr: number
  }>
  totalAmountInr: number
  paymentState: 'recorded' | 'verified' | 'paid'
  createdAt: string
  expectedAt?: string
}

export interface InventoryTransaction {
  id: string
  organizationId: string
  partId: string
  partName: string
  type: 'po_receive' | 'wo_consume' | 'manual_adjust'
  quantityDelta: number
  balanceAfter: number
  referenceType: 'purchase_order' | 'work_order' | 'audit'
  referenceId: string
  performedBy: string
  timestamp: string
}

export interface WorkshopVendor {
  id: string
  organizationId: string
  name: string
  city: string
  specialties: FiveAreaHealthCategory[]
  contactPhone: string
  slaTurnaroundHours: number
  avgTurnaroundHours: number
  completedJobsCount: number
  totalSpendInr: number
  rating: number
}

export interface FinancialInvoice {
  id: string
  organizationId: string
  invoiceNumber: string
  vendorName: string
  category: 'maintenance' | 'parts_po' | 'fuel' | 'insurance' | 'compliance'
  vehicleId?: string
  referenceId?: string
  amountInr: number
  paidAmountInr: number
  status: 'recorded' | 'verified' | 'partially_paid' | 'paid'
  dueDate: string
  issuedDate: string
  notes?: string
}

export interface PaymentRecord {
  id: string
  organizationId: string
  invoiceId: string
  invoiceNumber: string
  amountInr: number
  paymentMethod: 'neft' | 'rtgs' | 'upi' | 'fleet_card' | 'cheque'
  referenceNumber: string
  paidAt: string
  recordedBy: string
}

export interface VehicleInspection {
  id: string
  organizationId: string
  environment: OperatingEnvironment
  vehicleId: string
  driverId: string
  inspectorName?: string
  timestamp: string
  tyreCondition: 'good' | 'worn' | 'critical'
  brakeFeel: 'normal' | 'spongy' | 'squealing'
  fluidLeaksDetected: boolean
  warningLightsOn: boolean
  batteryOrStartingIssue: boolean
  notes: string
  passed: boolean
  linkedIssueIds?: string[]
}

export interface PredictionCausalFactor {
  factor: string
  label: string
  weight: number
  detail: string
}

export interface AIPrediction {
  id: string
  organizationId: string
  environment: OperatingEnvironment
  vehicleId: string
  componentName: ComponentCategory
  healthArea?: FiveAreaHealthCategory
  priority: 'low' | 'medium' | 'high' | 'critical'
  predictedIssue: string
  evidenceSummary: string
  recommendedAction: string
  confidenceScore: number
  confidenceLower: number
  confidenceUpper: number
  estimatedDaysToFailure: number
  earliestWindowDays: number
  latestWindowDays: number
  predictedFailureDate: string
  failureProbability7d: number
  failureProbability30d: number
  failureProbability90d: number
  repairCostInr: number
  delayCostInr: number
  costOfDelayPerDayInr: number
  potentialSavingsInr: number
  estimatedDowntimeDaysIfDelayed: number
  causalFactors: PredictionCausalFactor[]
  modelVersion: string
  generatedAt: string
  inputFeatureSnapshot: {
    vehicleAgeYears: number
    odometerKm: number
    dailyAvgKm: number
    componentHealthScore: number
    roadStressIndex: number
    driverHarshEventRate: number
    daysSinceLastService: number
    inspectionFlagsCount: number
  }
  status: 'open' | 'scheduled' | 'resolved'
  telemetryScopeNote: string
  insufficientData?: boolean
  insufficientDataReason?: string
}

export interface OperationalAlert {
  id: string
  organizationId: string
  environment: OperatingEnvironment
  vehicleId: string
  driverId?: string
  category: RiskCategory
  severity: RiskSeverity
  title: string
  message: string
  source?: string
  timestamp: string
  read: boolean
  acknowledged: boolean
  actionRoute: string
}

export interface RiskAssessmentItem {
  id: string
  organizationId: string
  vehicleId: string
  vehicleRegistration: string
  category: RiskCategory
  severity: RiskSeverity
  title: string
  evidence: string
  confidencePct: number
  insufficientData: boolean
  timestamp: string
  recommendedAction: string
  actionRoute: string
}

export interface AuditLogEntry {
  id: string
  organizationId: string
  environment: OperatingEnvironment
  actorName: string
  actorRole: OrganizationRole
  action: string
  entityType: string
  entityId: string
  summary: string
  reason?: string
  timestamp: string
}

export interface ReportHistoryItem {
  id: string
  organizationId: string
  environment: OperatingEnvironment
  categoryId: string
  title: string
  period: ReportingPeriod
  generatedBy: string
  generatedAt: string
  format: 'CSV' | 'PDF' | 'XLSX'
  rowCount: number
}

export type PlaceKind = 'depot' | 'fuel_station' | 'service_center' | 'customer' | 'parking' | 'other'

export interface PlaceRecord {
  id: string
  organizationId: string
  name: string
  kind: PlaceKind
  address: string
  city: string
  location?: LatLng
  notes?: string
}
