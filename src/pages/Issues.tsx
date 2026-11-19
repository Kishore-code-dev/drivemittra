import React, { useMemo, useState } from 'react'
import { Plus, Search, Wrench } from 'lucide-react'
import { toast } from 'sonner'
import PageHeader from '../components/layout/PageHeader'
import { EmptySectionState, EnterpriseModal, SeverityText } from '../components/ui/EnterprisePrimitives'
import { useFleet } from '../hooks/useFleet'
import { canPerformAction } from '../utils/rbac'
import type { FiveAreaHealthCategory, SmallIssueLog } from '../types/fleet'

type Filter = 'all' | SmallIssueLog['status']

const AREAS: FiveAreaHealthCategory[] = ['Fuel Health', 'Engine Health', 'Tyre Health', 'Driver Health', 'Vehicle Health']
const SEV_MAP: Record<SmallIssueLog['severity'], 'critical' | 'high' | 'moderate' | 'normal'> = {
  critical: 'critical',
  high: 'high',
  medium: 'moderate',
  low: 'normal',
}
const SOURCE_LABEL: Record<SmallIssueLog['source'], string> = {
  owner_manual: 'Logged manually',
  inspection_defect: 'Inspection defect',
  predictive_alert: 'Predictive alert',
}
const STATUS_LABEL: Record<SmallIssueLog['status'], string> = {
  open: 'Open',
  triaged: 'Triaged',
  converted_to_wo: 'In work order',
  resolved: 'Resolved',
}
const STATUS_TABS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'triaged', label: 'Triaged' },
  { key: 'converted_to_wo', label: 'In work order' },
  { key: 'resolved', label: 'Resolved' },
]

const fmtDate = (iso: string) =>
  Number.isNaN(new Date(iso).getTime())
    ? '—'
    : new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

export default function Issues() {
  const { activeOrganization, activeRole, vehicles, smallIssues, addSmallIssue, convertIssueToWorkOrder } = useFleet()
  const canLog = canPerformAction(activeRole, 'schedule_maintenance')
  const canManageWo = canPerformAction(activeRole, 'manage_work_orders')

  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    vehicleId: '',
    title: '',
    description: '',
    healthArea: 'Vehicle Health' as FiveAreaHealthCategory,
    severity: 'medium' as SmallIssueLog['severity'],
  })

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: smallIssues.length }
    smallIssues.forEach((i) => (c[i.status] = (c[i.status] ?? 0) + 1))
    return c
  }, [smallIssues])

  const visible = smallIssues
    .filter((i) => filter === 'all' || i.status === filter)
    .filter((i) => {
      const q = query.trim().toLowerCase()
      const reg = vehicles.find((v) => v.id === i.vehicleId)?.registrationNumber ?? ''
      return !q || `${i.title} ${i.description} ${reg}`.toLowerCase().includes(q)
    })
    .sort((a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime())

  const vehicleId = form.vehicleId || vehicles[0]?.id || ''

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!vehicleId || !form.title.trim()) {
      toast.error('Choose a vehicle and enter a title.')
      return
    }
    try {
      addSmallIssue({
        vehicleId,
        title: form.title.trim(),
        description: form.description.trim() || form.title.trim(),
        healthArea: form.healthArea,
        severity: form.severity,
        source: 'owner_manual',
      })
      toast.success('Issue logged.')
      setOpen(false)
      setForm((f) => ({ ...f, title: '', description: '' }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to log issue.')
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Issues & Faults"
        subtitle={<>{activeOrganization.name} · Defects from inspections, predictive alerts and manual reports, tracked until fixed</>}
      >
        {canLog && (
          <button type="button" onClick={() => setOpen(true)} className="btn-primary text-xs">
            <Plus className="w-4 h-4" />
            Report Issue
          </button>
        )}
      </PageHeader>

      <div className="enterprise-card p-0 overflow-hidden">
        <div className="p-4 border-b border-[#E5E5E5] flex flex-wrap items-center justify-between gap-3">
          <div role="tablist" aria-label="Issue status" className="flex flex-wrap gap-1.5">
            {STATUS_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={filter === t.key}
                onClick={() => setFilter(t.key)}
                className={`px-3 py-1.5 rounded-[8px] text-xs font-semibold border transition-colors ${
                  filter === t.key
                    ? 'bg-[#E1D7F2] text-[#6E5696] border-[#B8A3D9]'
                    : 'border-transparent text-[#625346] hover:bg-[#EEE8F7]/60'
                }`}
              >
                {t.label} <span className="tabular-nums text-[#958777]">{counts[t.key] ?? 0}</span>
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#958777]" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search issues" aria-label="Search issues" className="dm-input pl-8" />
          </div>
        </div>

        {visible.length === 0 ? (
          <EmptySectionState title="No issues here" description="Nothing matches this view. Report an issue or change the filter." />
        ) : (
          <div className="overflow-x-auto">
            <table className="dm-table w-full">
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Issue</th>
                  <th>Area</th>
                  <th>Severity</th>
                  <th>Source</th>
                  <th>Reported</th>
                  <th>Status</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((i) => {
                  const veh = vehicles.find((v) => v.id === i.vehicleId)
                  return (
                    <tr key={i.id}>
                      <td className="font-semibold tabular-nums">{veh?.registrationNumber ?? i.vehicleId}</td>
                      <td>
                        <span className="font-medium block">{i.title}</span>
                        {i.description !== i.title && <span className="text-xs text-[#958777] line-clamp-1">{i.description}</span>}
                      </td>
                      <td className="text-xs text-[#6E5696] font-semibold">{i.healthArea}</td>
                      <td><SeverityText severity={SEV_MAP[i.severity]} label={i.severity} /></td>
                      <td className="text-xs">{SOURCE_LABEL[i.source]}</td>
                      <td className="tabular-nums text-xs">{fmtDate(i.reportedAt)}</td>
                      <td className="text-xs">{STATUS_LABEL[i.status]}</td>
                      <td className="text-right">
                        {(i.status === 'open' || i.status === 'triaged') && canManageWo && (
                          <button
                            type="button"
                            onClick={() => {
                              const wo = convertIssueToWorkOrder(i.id)
                              if (wo) toast.success(`Work order ${wo.id} created.`)
                              else toast.error('Unable to create a work order for this issue.')
                            }}
                            className="btn-secondary text-xs"
                          >
                            <Wrench className="w-3.5 h-3.5" />
                            Create work order
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <EnterpriseModal open={open} onClose={() => setOpen(false)} title="Report an issue">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="iss-veh" className="dm-label">Vehicle *</label>
              <select id="iss-veh" value={vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })} className="dm-input">
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>{v.registrationNumber} · {v.model}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="iss-sev" className="dm-label">Severity</label>
              <select id="iss-sev" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value as SmallIssueLog['severity'] })} className="dm-input">
                {['low', 'medium', 'high', 'critical'].map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="iss-title" className="dm-label">What is wrong? *</label>
              <input id="iss-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Brake pedal feels soft" className="dm-input" />
            </div>
            <div>
              <label htmlFor="iss-area" className="dm-label">Area</label>
              <select id="iss-area" value={form.healthArea} onChange={(e) => setForm({ ...form, healthArea: e.target.value as FiveAreaHealthCategory })} className="dm-input">
                {AREAS.map((a) => <option key={a}>{a}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="iss-desc" className="dm-label">Details</label>
              <textarea id="iss-desc" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="dm-input" />
            </div>
          </div>
          <div className="flex justify-end gap-2.5 pt-1">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary text-xs">Cancel</button>
            <button type="submit" className="btn-primary text-xs">Log issue</button>
          </div>
        </form>
      </EnterpriseModal>
    </div>
  )
}
