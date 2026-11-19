import React, { useMemo, useState } from 'react'
import { CheckCircle2, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import PageHeader from '../components/layout/PageHeader'
import { EmptySectionState, EnterpriseModal, SeverityText } from '../components/ui/EnterprisePrimitives'
import { useFleet } from '../hooks/useFleet'
import { canPerformAction } from '../utils/rbac'
import type { FiveAreaHealthCategory, ServiceScheduleReminder } from '../types/fleet'

type Effective = 'overdue' | 'due_soon' | 'upcoming' | 'completed'
type Filter = 'all' | Effective

const AREAS: FiveAreaHealthCategory[] = ['Fuel Health', 'Engine Health', 'Tyre Health', 'Driver Health', 'Vehicle Health']
const DUE_SOON_DAYS = 14

const fmtDate = (iso: string) =>
  Number.isNaN(new Date(iso).getTime())
    ? '—'
    : new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

/** Status derived from the due date/odometer so it never goes stale. */
function effectiveStatus(r: ServiceScheduleReminder, odometerKm?: number): Effective {
  if (r.status === 'completed') return 'completed'
  const days = (new Date(r.dueDate).getTime() - Date.now()) / 86400000
  const kmLeft = odometerKm != null ? r.dueOdometerKm - odometerKm : Infinity
  if (days < 0 || kmLeft < 0) return 'overdue'
  if (days <= DUE_SOON_DAYS || kmLeft <= 500) return 'due_soon'
  return 'upcoming'
}

const SEVERITY: Record<Effective, 'critical' | 'high' | 'normal'> = {
  overdue: 'critical',
  due_soon: 'high',
  upcoming: 'normal',
  completed: 'normal',
}

export default function Reminders() {
  const { activeOrganization, activeRole, vehicles, serviceSchedules, addServiceSchedule, completeServiceSchedule } = useFleet()
  const canSchedule = canPerformAction(activeRole, 'schedule_maintenance')
  const canComplete = canPerformAction(activeRole, 'complete_maintenance')

  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(() => ({
    vehicleId: '',
    title: '',
    healthArea: 'Engine Health' as FiveAreaHealthCategory,
    dueDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    intervalDays: 90,
    intervalKm: 10000,
    dueOdometerKm: 0,
    priority: 'medium' as ServiceScheduleReminder['priority'],
  }))

  const rows = useMemo(
    () =>
      serviceSchedules.map((r) => {
        const veh = vehicles.find((v) => v.id === r.vehicleId)
        return { r, veh, status: effectiveStatus(r, veh?.odometerKm) }
      }),
    [serviceSchedules, vehicles],
  )

  const counts = useMemo(() => {
    const c: Record<Effective, number> = { overdue: 0, due_soon: 0, upcoming: 0, completed: 0 }
    rows.forEach((x) => (c[x.status] += 1))
    return c
  }, [rows])

  const visible = rows
    .filter((x) => filter === 'all' || x.status === filter)
    .filter((x) => {
      const q = query.trim().toLowerCase()
      return !q || `${x.r.title} ${x.veh?.registrationNumber ?? ''} ${x.r.healthArea}`.toLowerCase().includes(q)
    })
    .sort((a, b) => new Date(a.r.dueDate).getTime() - new Date(b.r.dueDate).getTime())

  const vehicleId = form.vehicleId || vehicles[0]?.id || ''

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!vehicleId || !form.title.trim()) {
      toast.error('Choose a vehicle and enter a title.')
      return
    }
    try {
      addServiceSchedule({
        vehicleId,
        title: form.title.trim(),
        healthArea: form.healthArea,
        intervalDays: Number(form.intervalDays),
        intervalKm: Number(form.intervalKm),
        dueDate: form.dueDate,
        dueOdometerKm: Number(form.dueOdometerKm) || (vehicles.find((v) => v.id === vehicleId)?.odometerKm ?? 0) + Number(form.intervalKm),
        priority: form.priority,
        status: 'upcoming',
      })
      toast.success('Reminder created.')
      setOpen(false)
      setForm((f) => ({ ...f, title: '' }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to create reminder.')
    }
  }

  const tiles: { key: Filter; label: string; value: number }[] = [
    { key: 'all', label: 'All reminders', value: rows.length },
    { key: 'overdue', label: 'Overdue', value: counts.overdue },
    { key: 'due_soon', label: `Due in ${DUE_SOON_DAYS} days`, value: counts.due_soon },
    { key: 'upcoming', label: 'Upcoming', value: counts.upcoming },
    { key: 'completed', label: 'Completed', value: counts.completed },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Service Reminders"
        subtitle={<>{activeOrganization.name} · Time and odometer based preventive service, tracked per vehicle</>}
      >
        {canSchedule && (
          <button type="button" onClick={() => setOpen(true)} className="btn-primary text-xs">
            <Plus className="w-4 h-4" />
            New Reminder
          </button>
        )}
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {tiles.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setFilter(t.key)}
            aria-pressed={filter === t.key}
            className={`enterprise-card p-4 text-left transition-colors ${filter === t.key ? 'border-[#B8A3D9] bg-[#EEE8F7]' : 'hover:bg-[#EEE8F7]/50'}`}
          >
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#958777] block">{t.label}</span>
            <span className={`dm-kpi-value tabular-nums ${t.key === 'overdue' && t.value > 0 ? 'text-[#B84E42]' : ''}`}>{t.value}</span>
          </button>
        ))}
      </div>

      <div className="enterprise-card p-0 overflow-hidden">
        <div className="p-4 border-b border-[#E5E5E5] relative">
          <Search className="w-3.5 h-3.5 absolute left-7 top-1/2 -translate-y-1/2 text-[#958777]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by vehicle, task or area"
            aria-label="Search reminders"
            className="dm-input pl-8 max-w-sm"
          />
        </div>
        {visible.length === 0 ? (
          <EmptySectionState title="No reminders match" description="Change the filter or create a new reminder." />
        ) : (
          <div className="overflow-x-auto">
            <table className="dm-table w-full">
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Service task</th>
                  <th>Area</th>
                  <th>Due date</th>
                  <th>Due at odometer</th>
                  <th>Status</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(({ r, veh, status }) => (
                  <tr key={r.id}>
                    <td className="font-semibold tabular-nums">{veh?.registrationNumber ?? r.vehicleId}</td>
                    <td>{r.title}</td>
                    <td className="text-xs text-[#6E5696] font-semibold">{r.healthArea}</td>
                    <td className="tabular-nums text-xs">{fmtDate(r.dueDate)}</td>
                    <td className="tabular-nums text-xs">{r.dueOdometerKm.toLocaleString('en-IN')} km</td>
                    <td>
                      <SeverityText severity={SEVERITY[status]} label={status.replace('_', ' ')} />
                    </td>
                    <td className="text-right">
                      {status !== 'completed' && canComplete && (
                        <button
                          type="button"
                          onClick={() => {
                            completeServiceSchedule(r.id)
                            toast.success('Reminder marked complete.')
                          }}
                          className="btn-secondary text-xs"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Mark done
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <EnterpriseModal open={open} onClose={() => setOpen(false)} title="New service reminder">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="rem-veh" className="dm-label">Vehicle *</label>
              <select id="rem-veh" value={vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })} className="dm-input">
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>{v.registrationNumber} · {v.model}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="rem-area" className="dm-label">Area</label>
              <select id="rem-area" value={form.healthArea} onChange={(e) => setForm({ ...form, healthArea: e.target.value as FiveAreaHealthCategory })} className="dm-input">
                {AREAS.map((a) => <option key={a}>{a}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="rem-title" className="dm-label">Service task *</label>
              <input id="rem-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Engine oil & filter change" className="dm-input" />
            </div>
            <div>
              <label htmlFor="rem-date" className="dm-label">Due date</label>
              <input id="rem-date" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="dm-input" />
            </div>
            <div>
              <label htmlFor="rem-pri" className="dm-label">Priority</label>
              <select id="rem-pri" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as ServiceScheduleReminder['priority'] })} className="dm-input">
                {['low', 'medium', 'high', 'critical'].map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="rem-days" className="dm-label">Repeat every (days)</label>
              <input id="rem-days" type="number" min={1} value={form.intervalDays} onChange={(e) => setForm({ ...form, intervalDays: Number(e.target.value) })} className="dm-input tabular-nums" />
            </div>
            <div>
              <label htmlFor="rem-km" className="dm-label">Repeat every (km)</label>
              <input id="rem-km" type="number" min={0} value={form.intervalKm} onChange={(e) => setForm({ ...form, intervalKm: Number(e.target.value) })} className="dm-input tabular-nums" />
            </div>
          </div>
          <div className="flex justify-end gap-2.5 pt-1">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary text-xs">Cancel</button>
            <button type="submit" className="btn-primary text-xs">Create reminder</button>
          </div>
        </form>
      </EnterpriseModal>
    </div>
  )
}
