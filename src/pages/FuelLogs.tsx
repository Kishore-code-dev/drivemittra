import React, { useMemo, useState } from 'react'
import { CheckCircle2, Flag, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useFleet } from '../hooks/useFleet'
import { canPerformAction } from '../utils/rbac'
import {
  EmptySectionState,
  EnterpriseModal,
  formatDateTime,
  formatInr,
  SeverityText,
} from '../components/ui/EnterprisePrimitives'
import type { FuelTransaction } from '../types/fleet'
import PageHeader from '../components/layout/PageHeader'

export default function FuelLogs() {
  const {
    activeOrganization,
    activeRole,
    vehicles,
    drivers,
    fuelTransactions,
    addFuelTransaction,
    verifyFuelTransaction,
  } = useFleet()

  const [filterStatus, setFilterStatus] = useState<'all' | 'verified' | 'pending' | 'needs_review'>('all')
  const [logModalOpen, setLogModalOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [form, setForm] = useState({
    vehicleId: vehicles[0]?.id ?? '',
    driverId: drivers[0]?.id ?? '',
    station: 'Indian Oil Commercial Station',
    litersOrKwh: 35,
    amountInr: 3220,
    odometerKm: vehicles[0]?.odometerKm ?? 45000,
    paymentMethod: 'upi' as FuelTransaction['paymentMethod'],
    entrySource: 'manual_driver_entry' as FuelTransaction['entrySource'],
  })

  const effectiveVehicleId = vehicles.some((v) => v.id === form.vehicleId)
    ? form.vehicleId
    : (vehicles[0]?.id ?? '')
  const effectiveDriverId = drivers.some((d) => d.id === form.driverId)
    ? form.driverId
    : (drivers[0]?.id ?? '')

  const canLogFuel = canPerformAction(activeRole, 'log_fuel')
  const canVerifyFuel = canPerformAction(activeRole, 'verify_fuel')

  const filtered = useMemo(() => {
    return fuelTransactions.filter(
      (tx) => filterStatus === 'all' || tx.verificationStatus === filterStatus,
    )
  }, [fuelTransactions, filterStatus])

  const totalSpend = fuelTransactions.reduce((s, f) => s + f.amountInr, 0)
  const totalUnits = fuelTransactions.reduce((s, f) => s + f.litersOrKwh, 0)
  const reviewCount = fuelTransactions.filter((f) => f.verificationStatus === 'needs_review').length
  const efficiencies = fuelTransactions
    .map((f) => f.efficiencyKmPerUnit)
    .filter((e): e is number => typeof e === 'number' && e > 0)
  const avgEfficiency =
    efficiencies.length > 0
      ? (efficiencies.reduce((s, e) => s + e, 0) / efficiencies.length).toFixed(2)
      : '—'

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    if (!effectiveVehicleId || !form.station.trim()) {
      setFormError('Please select a vehicle and enter the station or charger name.')
      return
    }
    if (Number(form.litersOrKwh) <= 0 || Number(form.amountInr) <= 0) {
      setFormError('Fuel quantity and total INR amount must be greater than zero.')
      return
    }
    if (Number(form.odometerKm) < 0) {
      setFormError('Odometer reading cannot be negative.')
      return
    }
    const unitPriceInr = Number((form.amountInr / form.litersOrKwh).toFixed(2))
    const vehicle = vehicles.find((v) => v.id === effectiveVehicleId)
    try {
      addFuelTransaction({
        vehicleId: effectiveVehicleId,
        driverId: effectiveDriverId || vehicle?.assignedDriverId || '',
        amountInr: Number(form.amountInr),
        litersOrKwh: Number(form.litersOrKwh),
        unitPriceInr,
        odometerKm: Number(form.odometerKm),
        station: form.station.trim(),
        location: vehicle?.telemetry.location ?? { lat: 13.0827, lng: 80.2707 },
        timestamp: new Date().toISOString(),
        paymentMethod: form.paymentMethod,
        entrySource: form.entrySource,
      })
      toast.success('Fuel / charging transaction logged and checked for baseline anomalies.')
      setLogModalOpen(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to record fuel entry.'
      setFormError(msg)
      toast.error(msg)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Fuel & Energy Intelligence" subtitle={<>{activeOrganization.name} · Distinguishes manual driver entries from automated feeds with duplicate & variance review</>}>
        {canLogFuel && (
          <button
            type="button"
            onClick={() => {
              setFormError(null)
              setForm((f) => ({
                ...f,
                vehicleId: vehicles[0]?.id ?? '',
                odometerKm: (vehicles[0]?.odometerKm ?? 45000) + 120,
              }))
              setLogModalOpen(true)
            }}
            className="btn-primary text-xs"
          >
            <Plus className="w-4 h-4" />
            Log Fuel / Charging
          </button>
        )}
      </PageHeader>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="enterprise-card p-4">
          <span className="text-xs font-semibold text-[#958777]">Total Fuel & Charging Spend</span>
          <p className="dm-kpi-value mt-1.5">{formatInr(totalSpend)}</p>
        </div>
        <div className="enterprise-card p-4">
          <span className="text-xs font-semibold text-[#958777]">Total Volume (L / kWh)</span>
          <p className="dm-kpi-value mt-1.5">{totalUnits.toFixed(1)}</p>
        </div>
        <div className="enterprise-card p-4">
          <span className="text-xs font-semibold text-[#958777]">Observed Avg Efficiency</span>
          <p className="dm-kpi-value mt-1.5">{avgEfficiency} km/unit</p>
        </div>
        <div className="enterprise-card p-4">
          <span className="text-xs font-semibold text-[#958777]">Flagged for Review</span>
          <p className="dm-kpi-value mt-1.5 flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${reviewCount > 0 ? 'bg-[#E8C65A]' : 'bg-[#789A75]'}`} />
            {reviewCount}
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="p-1.5 flex flex-wrap items-center gap-1 w-fit bg-[#EEE8F7] border border-[#DDD3ED] rounded-[10px]">
        {([
          { id: 'all', label: 'All Entries' },
          { id: 'needs_review', label: 'Needs Review' },
          { id: 'pending', label: 'Pending Verification' },
          { id: 'verified', label: 'Verified' },
        ] as const).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilterStatus(tab.id)}
            className={`px-3 py-1 rounded-[8px] text-xs font-semibold transition-colors whitespace-nowrap ${
              filterStatus === tab.id ? 'bg-[#FFFFFF] text-[#625346] shadow-subtle' : 'text-[#958777] hover:text-[#625346]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptySectionState
          title="No fuel or charging transactions match this view"
          description="Log a fuel fill or EV depot charging session to track cost per km and efficiency."
          actionLabel={canLogFuel ? 'Log Fuel Entry' : undefined}
          onAction={canLogFuel ? () => setLogModalOpen(true) : undefined}
        />
      ) : (
        <div className="enterprise-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="dm-table">
              <thead>
                <tr>
                  <th>Vehicle & Driver</th>
                  <th>Station & Source</th>
                  <th>Volume & Rate</th>
                  <th>Amount</th>
                  <th>Odometer / Efficiency</th>
                  <th>Status & Notes</th>
                  <th className="text-right">Review Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((tx) => {
                  const vehicle = vehicles.find((v) => v.id === tx.vehicleId)
                  const driver = drivers.find((d) => d.id === tx.driverId)
                  return (
                    <tr key={tx.id}>
                      <td>
                        <span className="font-bold text-[#625346] block tabular-nums">
                          {vehicle?.registrationNumber ?? tx.vehicleId}
                        </span>
                        <span className="text-xs text-[#958777]">{driver?.name ?? 'Driver'}</span>
                      </td>
                      <td>
                        <span className="font-medium text-[#625346] block">{tx.station}</span>
                        <span className="text-xs text-[#958777] capitalize">
                          {tx.entrySource.replace(/_/g, ' ')} · {tx.paymentMethod.replace(/_/g, ' ').toUpperCase()}
                        </span>
                      </td>
                      <td className="tabular-nums text-xs">
                        {tx.litersOrKwh} {vehicle?.powertrain === 'EV' ? 'kWh' : 'L'} @ ₹{tx.unitPriceInr}
                      </td>
                      <td className="font-bold tabular-nums text-[#625346]">
                        {formatInr(tx.amountInr)}
                      </td>
                      <td className="tabular-nums text-xs">
                        <span className="block">{tx.odometerKm.toLocaleString('en-IN')} km</span>
                        {tx.efficiencyKmPerUnit ? (
                          <span className="text-[#958777]">{tx.efficiencyKmPerUnit} km/unit (₹{tx.costPerKmInr}/km)</span>
                        ) : (
                          <span className="text-[#958777]">Baseline pending next fill</span>
                        )}
                      </td>
                      <td>
                        <SeverityText
                          severity={tx.verificationStatus === 'needs_review' ? 'high' : tx.verificationStatus === 'verified' ? 'normal' : 'moderate'}
                          label={tx.verificationStatus.replace('_', ' ')}
                        />
                        {tx.anomalyFlags.map((flag) => (
                          <p key={flag} className="text-[11px] text-[#A56021] mt-1 max-w-[230px] font-medium">
                            {flag}
                          </p>
                        ))}
                        <span className="text-[11px] text-[#958777] tabular-nums block mt-0.5">
                          {formatDateTime(tx.timestamp, activeOrganization.timezone)}
                        </span>
                      </td>
                      <td className="text-right">
                        {canVerifyFuel ? (
                          <div className="inline-flex items-center gap-1.5">
                            {tx.verificationStatus !== 'verified' && (
                              <button
                                type="button"
                                onClick={() => {
                                  verifyFuelTransaction(tx.id, 'verified')
                                  toast.success('Transaction verified.')
                                }}
                                className="btn-secondary text-xs px-2.5 py-1"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 text-[#4D6E4A]" />
                                Verify
                              </button>
                            )}
                            {tx.verificationStatus !== 'needs_review' && (
                              <button
                                type="button"
                                onClick={() => {
                                  verifyFuelTransaction(tx.id, 'needs_review')
                                  toast.info('Flagged transaction for manual receipt check.')
                                }}
                                className="btn-secondary text-xs px-2.5 py-1"
                              >
                                <Flag className="w-3.5 h-3.5 text-[#A56021]" />
                                Review
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-[#958777]">Read-only</span>
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

      {/* Log Fuel Modal */}
      <EnterpriseModal
        open={logModalOpen}
        onClose={() => setLogModalOpen(false)}
        title="Log Fuel or EV Charging Transaction"
        subtitle="Automatically checks for duplicate fills and odometer efficiency variance"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          {formError && (
            <div role="alert" className="p-3 rounded-[10px] bg-[#D9786C]/20 border border-[#D9786C] text-xs font-semibold text-[#625346]">
              {formError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="fuel-veh" className="dm-label">Vehicle *</label>
              <select
                id="fuel-veh"
                value={effectiveVehicleId}
                onChange={(e) => {
                  const veh = vehicles.find((v) => v.id === e.target.value)
                  setForm((f) => ({
                    ...f,
                    vehicleId: e.target.value,
                    odometerKm: veh ? veh.odometerKm + 80 : f.odometerKm,
                  }))
                }}
                className="dm-input"
              >
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>{v.registrationNumber} ({v.powertrain})</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="fuel-method" className="dm-label">Payment Method</label>
              <select
                id="fuel-method"
                value={form.paymentMethod}
                onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value as FuelTransaction['paymentMethod'] }))}
                className="dm-input"
              >
                <option value="upi">UPI</option>
                <option value="fleet_card">Fleet Card</option>
                <option value="cash">Cash</option>
                <option value="ev_charging">EV Depot Charging</option>
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="fuel-station" className="dm-label">Fuel Station / Charger *</label>
            <input id="fuel-station" required value={form.station} onChange={(e) => setForm((f) => ({ ...f, station: e.target.value }))} className="dm-input" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="fuel-qty" className="dm-label">Liters / kWh *</label>
              <input id="fuel-qty" type="number" step="0.1" min={0.1} required value={form.litersOrKwh} onChange={(e) => setForm((f) => ({ ...f, litersOrKwh: Number(e.target.value) }))} className="dm-input tabular-nums" />
            </div>
            <div>
              <label htmlFor="fuel-amt" className="dm-label">Total INR *</label>
              <input id="fuel-amt" type="number" min={1} required value={form.amountInr} onChange={(e) => setForm((f) => ({ ...f, amountInr: Number(e.target.value) }))} className="dm-input tabular-nums" />
            </div>
            <div>
              <label htmlFor="fuel-odo" className="dm-label">Odometer (km) *</label>
              <input id="fuel-odo" type="number" min={0} required value={form.odometerKm} onChange={(e) => setForm((f) => ({ ...f, odometerKm: Number(e.target.value) }))} className="dm-input tabular-nums" />
            </div>
          </div>
          <div>
            <label htmlFor="fuel-source" className="dm-label">Entry Source</label>
            <select id="fuel-source" value={form.entrySource} onChange={(e) => setForm((f) => ({ ...f, entrySource: e.target.value as FuelTransaction['entrySource'] }))} className="dm-input">
              <option value="manual_driver_entry">Manual Driver Entry</option>
              <option value="receipt_ocr">Receipt Scan</option>
              <option value="station_feed">Automated Station / Charger Feed</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setLogModalOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Record Entry</button>
          </div>
        </form>
      </EnterpriseModal>
    </div>
  )
}

