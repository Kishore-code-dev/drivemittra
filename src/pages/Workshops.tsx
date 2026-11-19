import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Clock, Phone, Plus, Wrench } from 'lucide-react'
import { toast } from 'sonner'
import { useFleet } from '../hooks/useFleet'
import { canPerformAction } from '../utils/rbac'
import { EnterpriseModal, formatInr } from '../components/ui/EnterprisePrimitives'
import type { FiveAreaHealthCategory } from '../types/fleet'
import PageHeader from '../components/layout/PageHeader'

const SPECIALTIES: FiveAreaHealthCategory[] = [
  'Fuel Health',
  'Engine Health',
  'Tyre Health',
  'Vehicle Health',
]

export default function Workshops() {
  const navigate = useNavigate()
  const { activeOrganization, activeRole, workshops, workOrders, addWorkshop } = useFleet()

  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({
    name: '',
    city: activeOrganization.city,
    contactPhone: '',
    slaTurnaroundHours: 24,
    specialties: ['Engine Health', 'Vehicle Health'] as FiveAreaHealthCategory[],
  })

  const canManage = canPerformAction(activeRole, 'manage_work_orders')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.contactPhone.trim()) return
    try {
      const ws = addWorkshop({
        name: form.name.trim(),
        city: form.city.trim(),
        contactPhone: form.contactPhone.trim(),
        slaTurnaroundHours: Number(form.slaTurnaroundHours),
        avgTurnaroundHours: Number(form.slaTurnaroundHours),
        specialties: form.specialties.length > 0 ? form.specialties : ['Vehicle Health'],
        rating: 4.5,
      })
      toast.success(`Added service workshop "${ws.name}"`)
      setAddOpen(false)
      setForm({
        name: '',
        city: activeOrganization.city,
        contactPhone: '',
        slaTurnaroundHours: 24,
        specialties: ['Engine Health', 'Vehicle Health'],
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to add workshop.')
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Workshops & External Service Vendors" subtitle={<>{activeOrganization.name} · Authorized service centers, SLA turnaround benchmarks & linked Work Orders</>}>
        {canManage && (
          <button type="button" onClick={() => setAddOpen(true)} className="btn-primary text-xs">
            <Plus className="w-4 h-4" />
            Register Workshop
          </button>
        )}
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {workshops.map((ws) => {
          const linkedWos = workOrders.filter((w) => w.workshopId === ws.id || w.workshopName === ws.name)
          const slaMet = ws.avgTurnaroundHours <= ws.slaTurnaroundHours
          return (
            <div key={ws.id} className="enterprise-card p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-[10px] bg-[#EEE8F7] flex items-center justify-center shrink-0">
                    <Building2 className="w-4 h-4 text-[#6E5696]" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-[#625346]">{ws.name}</h2>
                    <p className="text-xs text-[#958777]">{ws.city}</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-[#EEE8F7] text-[#6E5696] text-xs font-bold">
                  {ws.rating.toFixed(1)} ★
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {ws.specialties.map((sp) => (
                  <span key={sp} className="px-2 py-0.5 rounded bg-[#FAFAFA] border border-[#E5E5E5] text-[11px] font-medium text-[#625346]">
                    {sp}
                  </span>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs pt-2 border-t border-[#E5E5E5]">
                <div>
                  <span className="text-[#958777] flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    SLA vs Avg Turnaround
                  </span>
                  <p className={`font-bold tabular-nums mt-0.5 ${slaMet ? 'text-[#4D6E4A]' : 'text-[#8F6510]'}`}>
                    {ws.avgTurnaroundHours}h / {ws.slaTurnaroundHours}h SLA
                  </p>
                </div>
                <div>
                  <span className="text-[#958777] flex items-center gap-1">
                    <Wrench className="w-3 h-3" />
                    Completed / Spend
                  </span>
                  <p className="font-bold text-[#625346] tabular-nums mt-0.5">
                    {ws.completedJobsCount + linkedWos.length} jobs · {formatInr(ws.totalSpendInr)}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-[#E5E5E5] text-xs">
                <span className="text-[#958777] inline-flex items-center gap-1 tabular-nums">
                  <Phone className="w-3 h-3" />
                  {ws.contactPhone}
                </span>
                <button
                  type="button"
                  onClick={() => navigate('/dashboard/work-orders')}
                  className="font-semibold text-[#6E5696] hover:underline"
                >
                  Work Orders ({linkedWos.length}) →
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <EnterpriseModal open={addOpen} onClose={() => setAddOpen(false)} title="Register Authorized Workshop">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="ws-name" className="dm-label">Workshop Name *</label>
            <input id="ws-name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Sri Murugan Heavy Commercial Bay" className="dm-input" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ws-city" className="dm-label">City *</label>
              <input id="ws-city" required value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} className="dm-input" />
            </div>
            <div>
              <label htmlFor="ws-sla" className="dm-label">SLA Turnaround (hrs)</label>
              <input id="ws-sla" type="number" min={2} value={form.slaTurnaroundHours} onChange={(e) => setForm((f) => ({ ...f, slaTurnaroundHours: Number(e.target.value) }))} className="dm-input tabular-nums" />
            </div>
          </div>
          <div>
            <label htmlFor="ws-phone" className="dm-label">Dispatch Phone *</label>
            <input id="ws-phone" required value={form.contactPhone} onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))} placeholder="+91 98400 55443" className="dm-input tabular-nums" />
          </div>
          <div>
            <span className="dm-label">Specialties</span>
            <div className="flex flex-wrap gap-2 mt-1">
              {SPECIALTIES.map((sp) => {
                const active = form.specialties.includes(sp)
                return (
                  <button
                    key={sp}
                    type="button"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        specialties: active
                          ? f.specialties.filter((s) => s !== sp)
                          : [...f.specialties, sp],
                      }))
                    }
                    className={`px-2.5 py-1 rounded text-xs font-semibold border ${
                      active ? 'bg-[#EEE8F7] border-[#B8A3D9] text-[#6E5696]' : 'bg-[#FFFFFF] border-[#E5E5E5] text-[#958777]'
                    }`}
                  >
                    {sp}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setAddOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Register Workshop</button>
          </div>
        </form>
      </EnterpriseModal>
    </div>
  )
}
