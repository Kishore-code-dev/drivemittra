import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Info,
  Plus,
  RefreshCw,
  Wrench,
} from 'lucide-react'
import { toast } from 'sonner'
import { useFleet } from '../hooks/useFleet'
import {
  computeVehicleFiveAreaHealth,
  INTELLIGENCE_MODEL_VERSION,
  TELEMETRY_SCOPE_DISCLOSURE,
} from '../utils/intelligenceEngine'
import { canPerformAction } from '../utils/rbac'
import {
  EmptySectionState,
  EnterpriseModal,
  formatInr,
  formatShortDate,
  SeverityText,
} from '../components/ui/EnterprisePrimitives'
import type { AIPrediction, ComponentCategory, FiveAreaHealthCategory } from '../types/fleet'
import PageHeader from '../components/layout/PageHeader'

const FIVE_AREAS: Array<{
  area: FiveAreaHealthCategory
  subtitle: string
}> = [
  { area: 'Fuel Health', subtitle: 'Consumption variance, idle burn & receipt verification' },
  { area: 'Engine Health', subtitle: 'Powertrain, cooling, transmission & thermal stress' },
  { area: 'Tyre Health', subtitle: 'Multi-axle tread depth, alignment & wear rate' },
  { area: 'Driver Health', subtitle: 'Safety behavior & Indian DL compliance only (no medical diagnoses)' },
  { area: 'Vehicle Health', subtitle: 'Chassis, brakes, suspension, inspections & statutory permits' },
]

export default function Maintenance() {
  const navigate = useNavigate()
  const {
    activeOrganization,
    activeRole,
    vehicles,
    drivers,
    driverEvents,
    fuelTransactions,
    tyrePositions,
    inspections,
    predictions,
    maintenanceRecords,
    serviceSchedules,
    smallIssues,
    recalculatePredictions,
    scheduleMaintenance,
    completeMaintenance,
    resolvePrediction,
    addServiceSchedule,
    completeServiceSchedule,
    addSmallIssue,
    convertIssueToWorkOrder,
    nowTick,
  } = useFleet()

  const [selectedArea, setSelectedArea] = useState<'all' | FiveAreaHealthCategory>('all')
  const [sectionTab, setSectionTab] = useState<'intelligence' | 'schedules' | 'issues' | 'ledger'>('intelligence')
  const [selectedPredId, setSelectedPredId] = useState<string | null>(predictions[0]?.id ?? null)

  const [logModalOpen, setLogModalOpen] = useState(false)
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false)
  const [issueModalOpen, setIssueModalOpen] = useState(false)

  const [logForm, setLogForm] = useState({
    vehicleId: vehicles[0]?.id ?? '',
    serviceType: 'Scheduled Preventive Service',
    componentName: 'Brakes' as ComponentCategory | 'General Service',
    serviceCenter: 'Authorized Commercial Fleet Bay',
    description: 'Component inspection and preventive replacement',
    costInr: 4500,
    performedAt: new Date().toISOString().slice(0, 10),
  })

  const [schedForm, setSchedForm] = useState(() => ({
    vehicleId: vehicles[0]?.id ?? '',
    title: '10,000 km Engine Oil & Filter Service',
    healthArea: 'Engine Health' as FiveAreaHealthCategory,
    intervalDays: 90,
    intervalKm: 10000,
    dueDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    dueOdometerKm: (vehicles[0]?.odometerKm ?? 50000) + 10000,
    priority: 'medium' as 'low' | 'medium' | 'high' | 'critical',
  }))

  const [issueForm, setIssueForm] = useState({
    vehicleId: vehicles[0]?.id ?? '',
    title: '',
    description: '',
    healthArea: 'Vehicle Health' as FiveAreaHealthCategory,
    severity: 'medium' as 'low' | 'medium' | 'high' | 'critical',
  })

  const effectiveLogVehicleId = vehicles.some((v) => v.id === logForm.vehicleId)
    ? logForm.vehicleId
    : (vehicles[0]?.id ?? '')

  const canSchedule = canPerformAction(activeRole, 'schedule_maintenance')
  const canComplete = canPerformAction(activeRole, 'complete_maintenance')
  const canResolve = canPerformAction(activeRole, 'resolve_prediction')
  const canManageWo = canPerformAction(activeRole, 'manage_work_orders')

  // Compute 5-area fleet overview
  const fleetFiveAreaScores = useMemo(() => {
    const perVehicle = vehicles.map((v) => ({
      vehicle: v,
      health: computeVehicleFiveAreaHealth({
        vehicle: v,
        fuelTransactions,
        drivers,
        driverEvents,
        tyrePositions,
        inspections,
        smallIssues,
        nowMs: nowTick,
      }),
    }))

    const avgOf = (getter: (h: ReturnType<typeof computeVehicleFiveAreaHealth>) => { score: number; status: string }) => {
      const valid = perVehicle.map((p) => getter(p.health)).filter((x) => x.status !== 'insufficient_data')
      if (valid.length === 0) return { score: null as number | null, atRiskCount: 0, insufficientCount: perVehicle.length }
      const score = Math.round(valid.reduce((s, x) => s + x.score, 0) / valid.length)
      const atRiskCount = valid.filter((x) => x.status !== 'healthy').length
      return { score, atRiskCount, insufficientCount: perVehicle.length - valid.length }
    }

    return {
      'Fuel Health': avgOf((h) => h.fuelHealth),
      'Engine Health': avgOf((h) => h.engineHealth),
      'Tyre Health': avgOf((h) => h.tyreHealth),
      'Driver Health': avgOf((h) => h.driverHealth),
      'Vehicle Health': avgOf((h) => h.vehicleHealth),
    } as Record<FiveAreaHealthCategory, { score: number | null; atRiskCount: number; insufficientCount: number }>
  }, [vehicles, fuelTransactions, drivers, driverEvents, tyrePositions, inspections, smallIssues, nowTick])

  const filteredPredictions = useMemo(() => {
    return predictions.filter((p) => {
      if (p.status === 'resolved') return false
      if (selectedArea === 'all') return true
      return p.healthArea === selectedArea
    })
  }, [predictions, selectedArea])

  const selectedPrediction = useMemo(
    () => filteredPredictions.find((p) => p.id === selectedPredId) ?? filteredPredictions[0] ?? null,
    [filteredPredictions, selectedPredId],
  )

  const selectedVehicle = selectedPrediction
    ? vehicles.find((v) => v.id === selectedPrediction.vehicleId)
    : undefined

  const handleScheduleFromPrediction = (pred: AIPrediction) => {
    if (pred.insufficientData) {
      toast.error('Cannot schedule predictive overhaul without sufficient component telemetry.')
      return
    }
    const vehicle = vehicles.find((v) => v.id === pred.vehicleId)
    if (!vehicle) return
    try {
      scheduleMaintenance({
        vehicleId: vehicle.id,
        serviceType: `${pred.componentName} Preventive Overhaul`,
        componentName: pred.componentName,
        serviceCenter: `${vehicle.cityName} Commercial Service Bay`,
        description: pred.recommendedAction,
        costInr: pred.repairCostInr,
        performedAt: new Date(Date.now() + 2 * 86400000).toISOString(),
        linkedPredictionId: pred.id,
      })
      toast.success(`Scheduled ${pred.componentName} service for ${vehicle.registrationNumber}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to schedule service.')
    }
  }

  const handleLogServiceSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!effectiveLogVehicleId || !logForm.serviceCenter.trim()) return
    try {
      scheduleMaintenance({
        vehicleId: effectiveLogVehicleId,
        serviceType: logForm.serviceType,
        componentName: logForm.componentName,
        serviceCenter: logForm.serviceCenter,
        description: logForm.description,
        costInr: Number(logForm.costInr),
        performedAt: new Date(logForm.performedAt).toISOString(),
      })
      toast.success('Maintenance job scheduled in workshop ledger.')
      setLogModalOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to save service job.')
    }
  }

  const handleAddScheduleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const targetVehId = schedForm.vehicleId || vehicles[0]?.id
    if (!targetVehId || !schedForm.title.trim()) return
    try {
      addServiceSchedule({
        vehicleId: targetVehId,
        title: schedForm.title.trim(),
        healthArea: schedForm.healthArea,
        intervalDays: Number(schedForm.intervalDays),
        intervalKm: Number(schedForm.intervalKm),
        dueDate: schedForm.dueDate,
        dueOdometerKm: Number(schedForm.dueOdometerKm),
        priority: schedForm.priority,
        status: 'upcoming',
      })
      toast.success('Created preventive service schedule reminder.')
      setScheduleModalOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to create service reminder.')
    }
  }

  const handleAddIssueSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const targetVehId = issueForm.vehicleId || vehicles[0]?.id
    if (!targetVehId || !issueForm.title.trim()) return
    try {
      addSmallIssue({
        vehicleId: targetVehId,
        title: issueForm.title.trim(),
        description: issueForm.description.trim() || issueForm.title.trim(),
        healthArea: issueForm.healthArea,
        severity: issueForm.severity,
        source: 'owner_manual',
      })
      setIssueForm((f) => ({ ...f, title: '', description: '' }))
      setIssueModalOpen(false)
      toast.success('Small issue logged for fleet triage.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to log small issue.')
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="5-Area Predictive Maintenance & Workshop" subtitle={<>{activeOrganization.name} · Model {INTELLIGENCE_MODEL_VERSION} · Fuel, Engine, Tyre, Driver (safety/compliance), Vehicle Health</>}>
        <div className="flex flex-wrap items-center gap-2.5">
          {canResolve && (
            <button
              type="button"
              onClick={() => {
                recalculatePredictions()
                toast.success('Recalculated 5-area predictive health baselines.')
              }}
              className="btn-secondary text-xs"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#6E5696]" />
              Recalculate
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate('/dashboard/work-orders')}
            className="btn-accent text-xs"
          >
            <Wrench className="w-3.5 h-3.5 text-[#6E5696]" />
            Work Orders
          </button>
          {canSchedule && (
            <button
              type="button"
              onClick={() => setLogModalOpen(true)}
              className="btn-primary text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              Schedule Service
            </button>
          )}
        </div>
      </PageHeader>

      {/* Scope Disclosure */}
      <div className="lavender-surface p-4 flex items-start gap-3 text-xs text-[#625346]">
        <Info className="w-4 h-4 text-[#6E5696] shrink-0 mt-0.5" />
        <p>{TELEMETRY_SCOPE_DISCLOSURE}</p>
      </div>

      {/* 5 Core Intelligence Area Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {FIVE_AREAS.map(({ area, subtitle }) => {
          const stat = fleetFiveAreaScores[area]
          const active = selectedArea === area
          return (
            <button
              key={area}
              type="button"
              onClick={() => setSelectedArea(active ? 'all' : area)}
              className={`enterprise-card p-4 text-left transition-all border-l-2 ${
                active ? 'border-[#6E5696] bg-[#EEE8F7]/60' : 'border-l-[#E8C65A] hover:border-[#B8A3D9]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#625346]">{area}</span>
                {stat.atRiskCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FDF3E7] border border-[#E8C290] text-[#8F6510]">
                    {stat.atRiskCount} watch
                  </span>
                )}
              </div>
              <p className="dm-kpi-value mt-2">
                {stat.score !== null ? `${stat.score}%` : '—'}
              </p>
              <p className="text-[11px] text-[#958777] mt-1.5 leading-snug">{subtitle}</p>
            </button>
          )
        })}
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="border-b border-[#E5E5E5] overflow-x-auto">
        <div className="flex items-center gap-2 min-w-max">
          {[
            { id: 'intelligence', label: `5-Area Predictive Forecasts (${filteredPredictions.length})`, icon: RefreshCw },
            { id: 'schedules', label: `Service Schedules & Reminders (${serviceSchedules.length})`, icon: CalendarClock },
            { id: 'issues', label: `Small-Issue Logs (${smallIssues.length})`, icon: ClipboardList },
            { id: 'ledger', label: `Workshop & Service Ledger (${maintenanceRecords.length})`, icon: Wrench },
          ].map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSectionTab(tab.id as typeof sectionTab)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                  sectionTab === tab.id
                    ? 'border-[#6E5696] text-[#625346]'
                    : 'border-transparent text-[#958777] hover:text-[#625346]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* TAB 1: 5-Area Predictive Forecasts */}
      {sectionTab === 'intelligence' && (
        filteredPredictions.length === 0 ? (
          <EmptySectionState
            title="No active predictive items for this health area"
            description="Select another intelligence area above or inspect scheduled maintenance jobs."
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-5 enterprise-card divide-y divide-[#E5E5E5]/70 overflow-hidden">
              {filteredPredictions.map((pred) => {
                const vehicle = vehicles.find((v) => v.id === pred.vehicleId)
                const active = selectedPrediction?.id === pred.id
                return (
                  <button
                    key={pred.id}
                    type="button"
                    onClick={() => setSelectedPredId(pred.id)}
                    className={`w-full p-4 text-left transition-colors hover:bg-[#FAFAFA] ${
                      active ? 'bg-[#EEE8F7]' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <SeverityText
                          severity={pred.insufficientData ? 'moderate' : pred.priority}
                          label={pred.insufficientData ? 'Insufficient Data' : undefined}
                        />
                        <span className="text-xs font-bold text-[#625346] tabular-nums">
                          {vehicle?.registrationNumber}
                        </span>
                      </div>
                      <span className="text-[11px] font-semibold text-[#6E5696]">
                        {pred.healthArea ?? 'Vehicle Health'}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-[#625346] mt-1.5">
                      {pred.componentName} · {pred.predictedIssue}
                    </p>
                    <p className="text-xs text-[#958777] mt-1">
                      {pred.insufficientData
                        ? 'Insufficient telemetry baseline — prediction suppressed'
                        : `${pred.earliestWindowDays}–${pred.latestWindowDays}d · Est. save ${formatInr(pred.potentialSavingsInr)}`}
                    </p>
                  </button>
                )
              })}
            </div>

            {selectedPrediction && selectedVehicle && (
              <div className="lg:col-span-7 enterprise-card p-6 space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-[#E5E5E5]">
                  <div>
                    <div className="flex items-center gap-2">
                      <SeverityText
                        severity={selectedPrediction.insufficientData ? 'moderate' : selectedPrediction.priority}
                        label={selectedPrediction.insufficientData ? 'Insufficient Data' : undefined}
                      />
                      <span className="text-xs text-[#6E5696] font-semibold">
                        {selectedPrediction.healthArea ?? 'Vehicle Health'}
                      </span>
                    </div>
                    <h2 className="dm-section-title mt-2">
                      {selectedPrediction.componentName} — {selectedPrediction.predictedIssue}
                    </h2>
                    <button
                      type="button"
                      onClick={() => navigate(`/dashboard/fleet/vehicles/${selectedVehicle.id}`)}
                      className="text-xs font-semibold text-[#6E5696] hover:underline mt-1 tabular-nums"
                    >
                      {selectedVehicle.registrationNumber} · {selectedVehicle.make} {selectedVehicle.model}
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    {selectedPrediction.status === 'open' && !selectedPrediction.insufficientData && canSchedule && (
                      <button
                        type="button"
                        onClick={() => handleScheduleFromPrediction(selectedPrediction)}
                        className="btn-primary text-xs"
                      >
                        <Wrench className="w-3.5 h-3.5" />
                        Schedule Service
                      </button>
                    )}
                    {selectedPrediction.status !== 'resolved' && canResolve && (
                      <button
                        type="button"
                        onClick={() => {
                          resolvePrediction(selectedPrediction.id)
                          toast.success('Prediction marked resolved.')
                        }}
                        className="btn-secondary text-xs"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#4D6E4A]" />
                        Resolve
                      </button>
                    )}
                  </div>
                </div>

                {selectedPrediction.insufficientData ? (
                  <div className="lavender-surface p-5 space-y-2 border-[#B8A3D9]">
                    <div className="flex items-center gap-2 text-sm font-bold text-[#625346]">
                      <AlertCircle className="w-4 h-4 text-[#6E5696]" />
                      Insufficient data for a reliable prediction.
                    </div>
                    <p className="text-xs text-[#625346]">{selectedPrediction.insufficientDataReason}</p>
                    <p className="text-xs text-[#958777]">Action: {selectedPrediction.recommendedAction}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-[#FFFFFF] border border-[#E5E5E5] rounded-[10px] p-3">
                      <span className="text-[11px] text-[#958777] block">Preventive Repair</span>
                      <span className="text-base font-bold text-[#625346] tabular-nums">{formatInr(selectedPrediction.repairCostInr)}</span>
                    </div>
                    <div className="bg-[#D9786C]/20 border border-[#D9786C] rounded-[10px] p-3">
                      <span className="text-[11px] text-[#625346] font-medium block">Cost of Delay</span>
                      <span className="text-base font-bold text-[#625346] tabular-nums">{formatInr(selectedPrediction.delayCostInr)}</span>
                    </div>
                    <div className="bg-[#789A75]/20 border border-[#789A75] rounded-[10px] p-3">
                      <span className="text-[11px] text-[#625346] font-medium block">Est. Net Savings</span>
                      <span className="text-base font-bold text-[#625346] tabular-nums">{formatInr(selectedPrediction.potentialSavingsInr)}</span>
                    </div>
                    <div className="bg-[#FFFFFF] border border-[#E5E5E5] rounded-[10px] p-3">
                      <span className="text-[11px] text-[#958777] block">Failure Window</span>
                      <span className="text-base font-bold text-[#625346] tabular-nums">{selectedPrediction.earliestWindowDays}–{selectedPrediction.latestWindowDays}d</span>
                    </div>
                  </div>
                )}

                <div>
                  <h3 className="text-xs font-bold text-[#625346] mb-2">Contributing Factors & Evidence</h3>
                  <p className="text-xs text-[#958777] mb-3">{selectedPrediction.evidenceSummary}</p>
                  <div className="space-y-2">
                    {selectedPrediction.causalFactors.map((cf) => (
                      <div key={cf.factor} className="text-xs">
                        <div className="flex justify-between mb-1">
                          <span className="font-medium text-[#625346]">{cf.label}</span>
                          <span className="font-semibold text-[#625346] tabular-nums">{Math.round(cf.weight * 100)}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-[#E5E5E5] rounded-full overflow-hidden">
                          <div className="h-full bg-[#B8A3D9] rounded-full" style={{ width: `${Math.round(cf.weight * 100)}%` }} />
                        </div>
                        <p className="text-[11px] text-[#958777] mt-0.5">{cf.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      )}

      {/* TAB 2: Service Schedules & Reminders */}
      {sectionTab === 'schedules' && (
        <div className="enterprise-card overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E5E5E5] flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="dm-card-title">Service Schedules & Reminders (Date + Odometer)</h2>
              <p className="text-xs text-[#958777]">Automated interval reminders mapped to the 5 health areas</p>
            </div>
            {canSchedule && (
              <button type="button" onClick={() => setScheduleModalOpen(true)} className="btn-primary text-xs">
                <Plus className="w-3.5 h-3.5" />
                Add Service Schedule
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="dm-table">
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Reminder Title</th>
                  <th>Health Area</th>
                  <th>Due Date</th>
                  <th>Due Odometer</th>
                  <th>Status</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {serviceSchedules.map((sch) => {
                  const veh = vehicles.find((v) => v.id === sch.vehicleId)
                  return (
                    <tr key={sch.id}>
                      <td className="font-semibold tabular-nums">{veh?.registrationNumber ?? sch.vehicleId}</td>
                      <td>{sch.title}</td>
                      <td className="text-xs text-[#6E5696] font-semibold">{sch.healthArea}</td>
                      <td className="tabular-nums text-xs">{formatShortDate(sch.dueDate)}</td>
                      <td className="tabular-nums text-xs">{sch.dueOdometerKm.toLocaleString('en-IN')} km</td>
                      <td>
                        <SeverityText
                          severity={sch.status === 'overdue' ? 'critical' : sch.status === 'due_soon' ? 'high' : 'normal'}
                          label={sch.status.replace('_', ' ')}
                        />
                      </td>
                      <td className="text-right">
                        {sch.status !== 'completed' && canComplete ? (
                          <button
                            type="button"
                            onClick={() => {
                              completeServiceSchedule(sch.id)
                              toast.success('Service reminder rolled forward to next interval.')
                            }}
                            className="btn-secondary text-xs px-2.5 py-1"
                          >
                            Mark Serviced
                          </button>
                        ) : (
                          <span className="text-xs text-[#958777]">Completed</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {serviceSchedules.length === 0 && (
                  <tr><td colSpan={7} className="text-center text-xs text-[#958777] py-8">No preventive service schedules configured yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: Small-Issue Logs w/ 1-click Convert to Work Order */}
      {sectionTab === 'issues' && (
        <div className="enterprise-card overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E5E5E5] flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="dm-card-title">Fleet Small-Issue Logs</h2>
              <p className="text-xs text-[#958777]">Minor mechanical or compliance defects ready for 1-click Work Order escalation</p>
            </div>
            {canManageWo && (
              <button type="button" onClick={() => setIssueModalOpen(true)} className="btn-primary text-xs">
                <Plus className="w-3.5 h-3.5" />
                Log Small Issue
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="dm-table">
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Issue</th>
                  <th>Health Area</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {smallIssues.map((iss) => {
                  const veh = vehicles.find((v) => v.id === iss.vehicleId)
                  return (
                    <tr key={iss.id}>
                      <td className="font-semibold tabular-nums">{veh?.registrationNumber ?? iss.vehicleId}</td>
                      <td>
                        <p className="font-medium text-[#625346]">{iss.title}</p>
                        <p className="text-[11px] text-[#958777]">{iss.description}</p>
                      </td>
                      <td className="text-xs text-[#6E5696] font-semibold">{iss.healthArea}</td>
                      <td>
                        <SeverityText severity={iss.severity === 'critical' ? 'critical' : iss.severity === 'high' ? 'high' : 'moderate'} label={iss.severity} />
                      </td>
                      <td className="text-xs capitalize">{iss.status.replace(/_/g, ' ')}</td>
                      <td className="text-right">
                        {iss.status === 'converted_to_wo' ? (
                          <button type="button" onClick={() => navigate('/dashboard/work-orders')} className="btn-secondary text-xs px-2.5 py-1">
                            View Work Order
                          </button>
                        ) : canManageWo ? (
                          <button
                            type="button"
                            onClick={() => {
                              const wo = convertIssueToWorkOrder(iss.id)
                              if (wo) toast.success(`Converted issue into Work Order ${wo.workOrderNumber}`)
                            }}
                            className="btn-accent text-xs px-2.5 py-1"
                          >
                            Convert to Work Order
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
                {smallIssues.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-xs text-[#958777] py-8">No small issues currently logged.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: Workshop Maintenance Ledger */}
      {sectionTab === 'ledger' && (
        <div className="enterprise-card overflow-hidden">
          <div className="px-5 py-4 bg-[#FFFFFF] border-b border-[#E5E5E5] flex items-center justify-between">
            <div>
              <h2 className="dm-card-title">Workshop & Service Ledger</h2>
              <p className="text-xs text-[#958777]">Scheduled and completed service records update vehicle component health directly</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="dm-table">
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Service Type</th>
                  <th>Component</th>
                  <th>Workshop</th>
                  <th>Date</th>
                  <th>Cost</th>
                  <th>Status</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {maintenanceRecords.map((rec) => {
                  const vehicle = vehicles.find((v) => v.id === rec.vehicleId)
                  return (
                    <tr key={rec.id}>
                      <td className="font-semibold tabular-nums">{vehicle?.registrationNumber ?? rec.vehicleId}</td>
                      <td className="font-medium">{rec.serviceType}</td>
                      <td>{rec.componentName}</td>
                      <td className="text-[#958777]">{rec.serviceCenter}</td>
                      <td className="text-xs tabular-nums">{formatShortDate(rec.performedAt)}</td>
                      <td className="tabular-nums font-medium">{formatInr(rec.costInr)}</td>
                      <td>
                        <SeverityText severity={rec.status === 'completed' ? 'normal' : 'high'} label={rec.status.replace('_', ' ')} />
                      </td>
                      <td className="text-right">
                        {rec.status !== 'completed' ? (
                          canComplete ? (
                            <button
                              type="button"
                              onClick={() => {
                                completeMaintenance(rec.id)
                                toast.success('Service marked completed and component baseline restored.')
                              }}
                              className="btn-secondary text-xs px-3 py-1"
                            >
                              Mark Completed
                            </button>
                          ) : (
                            <span className="text-xs text-[#958777]">Scheduled</span>
                          )
                        ) : (
                          <span className="text-xs text-[#958777]">Closed</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Schedule Workshop Service Modal */}
      <EnterpriseModal open={logModalOpen} onClose={() => setLogModalOpen(false)} title="Schedule Workshop Maintenance">
        <form onSubmit={handleLogServiceSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="maint-veh" className="dm-label">Vehicle *</label>
              <select id="maint-veh" value={effectiveLogVehicleId} onChange={(e) => setLogForm((f) => ({ ...f, vehicleId: e.target.value }))} className="dm-input">
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>{v.registrationNumber} · {v.model}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="maint-comp" className="dm-label">Component</label>
              <select id="maint-comp" value={logForm.componentName} onChange={(e) => setLogForm((f) => ({ ...f, componentName: e.target.value as ComponentCategory }))} className="dm-input">
                {['Engine', 'Brakes', 'Tyres', 'Battery', 'Suspension', 'Transmission', 'Cooling System', 'EV Battery', 'General Service'].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="maint-type" className="dm-label">Service Title *</label>
            <input id="maint-type" required value={logForm.serviceType} onChange={(e) => setLogForm((f) => ({ ...f, serviceType: e.target.value }))} className="dm-input" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="maint-center" className="dm-label">Service Center *</label>
              <input id="maint-center" required value={logForm.serviceCenter} onChange={(e) => setLogForm((f) => ({ ...f, serviceCenter: e.target.value }))} className="dm-input" />
            </div>
            <div>
              <label htmlFor="maint-cost" className="dm-label">Est. Cost (INR)</label>
              <input id="maint-cost" type="number" min={0} value={logForm.costInr} onChange={(e) => setLogForm((f) => ({ ...f, costInr: Number(e.target.value) }))} className="dm-input tabular-nums" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setLogModalOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Save Service Job</button>
          </div>
        </form>
      </EnterpriseModal>

      {/* Add Service Schedule Modal */}
      <EnterpriseModal open={scheduleModalOpen} onClose={() => setScheduleModalOpen(false)} title="Create Service Schedule Reminder">
        <form onSubmit={handleAddScheduleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="sch-veh" className="dm-label">Vehicle</label>
              <select id="sch-veh" value={schedForm.vehicleId || vehicles[0]?.id} onChange={(e) => setSchedForm((s) => ({ ...s, vehicleId: e.target.value }))} className="dm-input">
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.registrationNumber}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="sch-area" className="dm-label">5-Area Health Category</label>
              <select id="sch-area" value={schedForm.healthArea} onChange={(e) => setSchedForm((s) => ({ ...s, healthArea: e.target.value as FiveAreaHealthCategory }))} className="dm-input">
                {FIVE_AREAS.map((a) => <option key={a.area} value={a.area}>{a.area}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="sch-title" className="dm-label">Schedule Title</label>
            <input id="sch-title" required value={schedForm.title} onChange={(e) => setSchedForm((s) => ({ ...s, title: e.target.value }))} className="dm-input" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="sch-date" className="dm-label">Due Date</label>
              <input id="sch-date" type="date" value={schedForm.dueDate} onChange={(e) => setSchedForm((s) => ({ ...s, dueDate: e.target.value }))} className="dm-input tabular-nums" />
            </div>
            <div>
              <label htmlFor="sch-odo" className="dm-label">Due Odometer (km)</label>
              <input id="sch-odo" type="number" value={schedForm.dueOdometerKm} onChange={(e) => setSchedForm((s) => ({ ...s, dueOdometerKm: Number(e.target.value) }))} className="dm-input tabular-nums" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setScheduleModalOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Create Schedule</button>
          </div>
        </form>
      </EnterpriseModal>

      {/* Log Small Issue Modal */}
      <EnterpriseModal open={issueModalOpen} onClose={() => setIssueModalOpen(false)} title="Log Vehicle Small Issue">
        <form onSubmit={handleAddIssueSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="iss-veh" className="dm-label">Vehicle</label>
              <select id="iss-veh" value={issueForm.vehicleId || vehicles[0]?.id} onChange={(e) => setIssueForm((s) => ({ ...s, vehicleId: e.target.value }))} className="dm-input">
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.registrationNumber}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="iss-area" className="dm-label">Health Area</label>
              <select id="iss-area" value={issueForm.healthArea} onChange={(e) => setIssueForm((s) => ({ ...s, healthArea: e.target.value as FiveAreaHealthCategory }))} className="dm-input">
                {FIVE_AREAS.map((a) => <option key={a.area} value={a.area}>{a.area}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="iss-title" className="dm-label">Issue Summary *</label>
            <input id="iss-title" required value={issueForm.title} onChange={(e) => setIssueForm((s) => ({ ...s, title: e.target.value }))} placeholder="e.g. Rear wiper & washer pump weak" className="dm-input" />
          </div>
          <div>
            <label htmlFor="iss-desc" className="dm-label">Details</label>
            <textarea id="iss-desc" rows={2} value={issueForm.description} onChange={(e) => setIssueForm((s) => ({ ...s, description: e.target.value }))} className="dm-input" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setIssueModalOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Log Issue</button>
          </div>
        </form>
      </EnterpriseModal>
    </div>
  )
}
