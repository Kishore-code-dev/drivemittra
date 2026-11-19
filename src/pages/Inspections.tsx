import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, ClipboardCheck, Plus, Wrench } from 'lucide-react'
import { toast } from 'sonner'
import { useFleet } from '../hooks/useFleet'
import { canPerformAction } from '../utils/rbac'
import {
  EmptySectionState,
  EnterpriseModal,
  formatDateTime,
  SeverityText,
} from '../components/ui/EnterprisePrimitives'
import PageHeader from '../components/layout/PageHeader'

export default function Inspections() {
  const navigate = useNavigate()
  const {
    activeOrganization,
    activeRole,
    vehicles,
    drivers,
    inspections,
    smallIssues,
    submitVehicleInspection,
    addSmallIssue,
    convertIssueToWorkOrder,
  } = useFleet()

  const [filterMode, setFilterMode] = useState<'all' | 'defects' | 'passed'>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({
    vehicleId: vehicles[0]?.id ?? '',
    driverId: drivers[0]?.id ?? '',
    inspectorName: 'Fleet Supervisor',
    tyreCondition: 'good' as 'good' | 'worn' | 'critical',
    brakeFeel: 'normal' as 'normal' | 'spongy' | 'squealing',
    fluidLeaksDetected: false,
    warningLightsOn: false,
    batteryOrStartingIssue: false,
    notes: '',
  })

  const canManageWo = canPerformAction(activeRole, 'manage_work_orders')
  const canInspect = canPerformAction(activeRole, 'schedule_maintenance') || canPerformAction(activeRole, 'edit_vehicle')

  const filteredInspections = useMemo(() => {
    return inspections.filter((ins) => {
      if (filterMode === 'defects') return !ins.passed
      if (filterMode === 'passed') return ins.passed
      return true
    })
  }, [inspections, filterMode])

  const defectCount = inspections.filter((i) => !i.passed).length

  const handleSubmitInspection = (e: React.FormEvent) => {
    e.preventDefault()
    const targetVeh = form.vehicleId || vehicles[0]?.id
    if (!targetVeh) return
    try {
      const created = submitVehicleInspection({
        vehicleId: targetVeh,
        driverId: form.driverId || drivers[0]?.id || '',
        inspectorName: form.inspectorName.trim() || 'Owner Inspection',
        tyreCondition: form.tyreCondition,
        brakeFeel: form.brakeFeel,
        fluidLeaksDetected: form.fluidLeaksDetected,
        warningLightsOn: form.warningLightsOn,
        batteryOrStartingIssue: form.batteryOrStartingIssue,
        notes: form.notes.trim(),
      })
      toast.success(
        created.passed
          ? 'Pre-trip inspection passed and logged.'
          : 'Inspection logged with safety defects — ready for Work Order escalation.',
      )
      setModalOpen(false)
      setForm((f) => ({
        ...f,
        tyreCondition: 'good',
        brakeFeel: 'normal',
        fluidLeaksDetected: false,
        warningLightsOn: false,
        batteryOrStartingIssue: false,
        notes: '',
      }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to log inspection.')
    }
  }

  const handleEscalateToWorkOrder = (ins: (typeof inspections)[number]) => {
    if (!canManageWo) return
    const issue = addSmallIssue({
      vehicleId: ins.vehicleId,
      driverId: ins.driverId,
      title: `Inspection Defect: Tyres ${ins.tyreCondition} · Brakes ${ins.brakeFeel}`,
      description:
        ins.notes ||
        `Pre-trip defect flags: leaks=${ins.fluidLeaksDetected}, MIL=${ins.warningLightsOn}, starting=${ins.batteryOrStartingIssue}`,
      healthArea: ins.tyreCondition !== 'good' ? 'Tyre Health' : 'Vehicle Health',
      severity: ins.tyreCondition === 'critical' || ins.warningLightsOn ? 'critical' : 'high',
      source: 'inspection_defect',
    })
    const wo = convertIssueToWorkOrder(issue.id)
    if (wo) {
      toast.success(`Escalated inspection defect to Work Order ${wo.workOrderNumber}`)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Vehicle Inspections & Defect Queue" subtitle={<>{activeOrganization.name} · Owner-supervised pre-trip & workshop roadworthiness checks</>}>
        {canInspect && (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="btn-primary text-xs"
          >
            <Plus className="w-4 h-4" />
            Log Inspection
          </button>
        )}
      </PageHeader>

      {/* Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="enterprise-card p-4">
          <span className="text-xs font-semibold text-[#958777]">Total Logged Checks</span>
          <p className="dm-kpi-value mt-1">{inspections.length}</p>
        </div>
        <div className="enterprise-card p-4">
          <span className="text-xs font-semibold text-[#958777]">Active Defect Flags</span>
          <p className="dm-kpi-value mt-1 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-[#A24034]" />
            {defectCount}
          </p>
        </div>
        <div className="enterprise-card p-4">
          <span className="text-xs font-semibold text-[#958777]">Pass Rate</span>
          <p className="dm-kpi-value mt-1 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-[#4D6E4A]" />
            {inspections.length > 0 ? `${Math.round(((inspections.length - defectCount) / inspections.length) * 100)}%` : '—'}
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="enterprise-card p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 bg-[#EEE8F7] p-1 rounded-[10px] border border-[#DDD3ED]">
          {(['all', 'defects', 'passed'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setFilterMode(m)}
              className={`px-3 py-1 rounded-[8px] text-xs font-semibold capitalize transition-colors ${
                filterMode === m ? 'bg-[#FFFFFF] text-[#625346] shadow-subtle' : 'text-[#958777] hover:text-[#625346]'
              }`}
            >
              {m === 'defects' ? `Defects Only (${defectCount})` : m}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => navigate('/dashboard/work-orders')}
          className="text-xs font-semibold text-[#6E5696] hover:underline"
        >
          Open Work Orders →
        </button>
      </div>

      {filteredInspections.length === 0 ? (
        <EmptySectionState
          title="No inspections recorded for this filter"
          description="Log a pre-trip or depot inspection to verify tyres, brakes, fluid leaks, and dashboard warning lamps."
          actionLabel={canInspect ? 'Log Inspection' : undefined}
          onAction={canInspect ? () => setModalOpen(true) : undefined}
        />
      ) : (
        <div className="enterprise-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="dm-table">
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Driver / Inspector</th>
                  <th>Tyres & Brakes</th>
                  <th>Flags</th>
                  <th>Notes & Timestamp</th>
                  <th>Result</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredInspections.map((ins) => {
                  const veh = vehicles.find((v) => v.id === ins.vehicleId)
                  const drv = drivers.find((d) => d.id === ins.driverId)
                  const alreadyEscalated = smallIssues.some(
                    (s) => s.vehicleId === ins.vehicleId && s.source === 'inspection_defect' && s.status === 'converted_to_wo',
                  )
                  return (
                    <tr key={ins.id}>
                      <td>
                        <button
                          type="button"
                          onClick={() => navigate(`/dashboard/fleet/vehicles/${ins.vehicleId}`)}
                          className="font-bold text-[#625346] hover:underline tabular-nums"
                        >
                          {veh?.registrationNumber ?? ins.vehicleId}
                        </button>
                      </td>
                      <td className="text-xs">
                        <p className="font-medium text-[#625346]">{drv?.name ?? 'Depot Check'}</p>
                        <p className="text-[#958777]">{ins.inspectorName ?? 'Supervisor'}</p>
                      </td>
                      <td className="text-xs capitalize">
                        Tyres: <strong>{ins.tyreCondition}</strong> · Brakes: <strong>{ins.brakeFeel}</strong>
                      </td>
                      <td className="text-xs text-[#625346]">
                        {[
                          ins.fluidLeaksDetected && 'Fluid Leak',
                          ins.warningLightsOn && 'Warning MIL',
                          ins.batteryOrStartingIssue && 'Starting Issue',
                        ]
                          .filter(Boolean)
                          .join(', ') || 'None'}
                      </td>
                      <td className="text-xs">
                        <p className="text-[#625346]">{ins.notes || 'Standard checklist completed'}</p>
                        <p className="text-[#958777] tabular-nums">{formatDateTime(ins.timestamp, activeOrganization.timezone)}</p>
                      </td>
                      <td>
                        <SeverityText severity={ins.passed ? 'normal' : 'high'} label={ins.passed ? 'Passed' : 'Defect Found'} />
                      </td>
                      <td className="text-right">
                        {!ins.passed && canManageWo ? (
                          <button
                            type="button"
                            onClick={() => handleEscalateToWorkOrder(ins)}
                            className="btn-accent text-xs px-2.5 py-1"
                          >
                            <Wrench className="w-3.5 h-3.5 text-[#6E5696]" />
                            {alreadyEscalated ? 'Create Follow-Up WO' : 'Escalate to Work Order'}
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-[#4D6E4A] font-medium">
                            <ClipboardCheck className="w-3.5 h-3.5" />
                            Cleared
                          </span>
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

      <EnterpriseModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Log Vehicle Inspection Checklist"
      >
        <form onSubmit={handleSubmitInspection} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="ins-veh" className="dm-label">Vehicle *</label>
              <select id="ins-veh" value={form.vehicleId || vehicles[0]?.id} onChange={(e) => setForm((f) => ({ ...f, vehicleId: e.target.value }))} className="dm-input">
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.registrationNumber} · {v.model}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="ins-drv" className="dm-label">Driver</label>
              <select id="ins-drv" value={form.driverId || drivers[0]?.id} onChange={(e) => setForm((f) => ({ ...f, driverId: e.target.value }))} className="dm-input">
                {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="ins-tyre" className="dm-label">Tyre Condition</label>
              <select id="ins-tyre" value={form.tyreCondition} onChange={(e) => setForm((f) => ({ ...f, tyreCondition: e.target.value as typeof form.tyreCondition }))} className="dm-input">
                <option value="good">Good</option>
                <option value="worn">Worn</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label htmlFor="ins-brake" className="dm-label">Brake Feel</label>
              <select id="ins-brake" value={form.brakeFeel} onChange={(e) => setForm((f) => ({ ...f, brakeFeel: e.target.value as typeof form.brakeFeel }))} className="dm-input">
                <option value="normal">Normal</option>
                <option value="spongy">Spongy</option>
                <option value="squealing">Squealing</option>
              </select>
            </div>
          </div>
          <div className="space-y-2 text-xs">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.fluidLeaksDetected} onChange={(e) => setForm((f) => ({ ...f, fluidLeaksDetected: e.target.checked }))} />
              Fluid / Coolant / Brake Oil Leaks Detected
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.warningLightsOn} onChange={(e) => setForm((f) => ({ ...f, warningLightsOn: e.target.checked }))} />
              Dashboard Check Engine / ABS / Warning Lights On
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.batteryOrStartingIssue} onChange={(e) => setForm((f) => ({ ...f, batteryOrStartingIssue: e.target.checked }))} />
              Battery Cranking / Starting Lag
            </label>
          </div>
          <div>
            <label htmlFor="ins-notes" className="dm-label">Inspector Notes</label>
            <textarea id="ins-notes" rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Odometer / tread notes or roadside observations..." className="dm-input" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Submit Inspection</button>
          </div>
        </form>
      </EnterpriseModal>
    </div>
  )
}
