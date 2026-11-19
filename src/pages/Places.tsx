import React, { useMemo, useState } from 'react'
import { ExternalLink, MapPin, Plus, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import PageHeader from '../components/layout/PageHeader'
import { EmptySectionState, EnterpriseModal } from '../components/ui/EnterprisePrimitives'
import { useFleet } from '../hooks/useFleet'
import { canPerformAction } from '../utils/rbac'
import type { PlaceKind } from '../types/fleet'

const KINDS: { key: PlaceKind; label: string }[] = [
  { key: 'depot', label: 'Depot' },
  { key: 'fuel_station', label: 'Fuel station' },
  { key: 'service_center', label: 'Service centre' },
  { key: 'customer', label: 'Customer site' },
  { key: 'parking', label: 'Parking / yard' },
  { key: 'other', label: 'Other' },
]
const kindLabel = (k: PlaceKind) => KINDS.find((x) => x.key === k)?.label ?? k

export default function Places() {
  const { activeOrganization, activeRole, places, addPlace, removePlace } = useFleet()
  const canEdit = canPerformAction(activeRole, 'update_org_settings')

  const [filter, setFilter] = useState<'all' | PlaceKind>('all')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', kind: 'depot' as PlaceKind, address: '', city: '', lat: '', lng: '', notes: '' })

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return places
      .filter((p) => filter === 'all' || p.kind === filter)
      .filter((p) => !q || `${p.name} ${p.address} ${p.city}`.toLowerCase().includes(q))
  }, [places, filter, query])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.city.trim()) {
      toast.error('Name and city are required.')
      return
    }
    const lat = form.lat.trim() === '' ? NaN : Number(form.lat)
    const lng = form.lng.trim() === '' ? NaN : Number(form.lng)
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng)
    if (hasCoords && (Math.abs(lat) > 90 || Math.abs(lng) > 180)) {
      toast.error('Coordinates are out of range.')
      return
    }
    try {
      addPlace({
        name: form.name.trim(),
        kind: form.kind,
        address: form.address.trim(),
        city: form.city.trim(),
        location: hasCoords ? { lat, lng } : undefined,
        notes: form.notes.trim() || undefined,
      })
      toast.success('Place saved.')
      setOpen(false)
      setForm({ name: '', kind: 'depot', address: '', city: '', lat: '', lng: '', notes: '' })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to save place.')
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Places"
        subtitle={<>{activeOrganization.name} · Depots, fuel stops, service centres and customer sites used across trips and maps</>}
      >
        {canEdit && (
          <button type="button" onClick={() => setOpen(true)} className="btn-primary text-xs">
            <Plus className="w-4 h-4" />
            Add Place
          </button>
        )}
      </PageHeader>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Place type" className="flex flex-wrap gap-1.5">
          {[{ key: 'all' as const, label: 'All' }, ...KINDS].map((k) => (
            <button
              key={k.key}
              type="button"
              role="tab"
              aria-selected={filter === k.key}
              onClick={() => setFilter(k.key)}
              className={`px-3 py-1.5 rounded-[8px] text-xs font-semibold border transition-colors ${
                filter === k.key ? 'bg-[#E1D7F2] text-[#6E5696] border-[#B8A3D9]' : 'border-transparent text-[#625346] hover:bg-[#EEE8F7]/60'
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#958777]" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search places" aria-label="Search places" className="dm-input pl-8" />
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptySectionState title="No places yet" description="Save the depots, fuel stops and sites your fleet uses regularly." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((p) => (
            <div key={p.id} className="enterprise-card p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="dm-card-title truncate">{p.name}</h3>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6E5696]">{kindLabel(p.kind)}</span>
                </div>
                <MapPin className="w-4 h-4 text-[#958777] shrink-0" />
              </div>
              <p className="text-sm text-[#625346]">
                {[p.address, p.city].filter(Boolean).join(', ')}
              </p>
              {p.notes && <p className="text-xs text-[#958777]">{p.notes}</p>}
              <div className="flex items-center justify-between pt-1">
                {p.location ? (
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${p.location.lat}&mlon=${p.location.lng}#map=15/${p.location.lat}/${p.location.lng}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#6E5696] hover:underline tabular-nums"
                  >
                    {p.location.lat.toFixed(4)}, {p.location.lng.toFixed(4)}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <span className="text-xs text-[#958777]">No coordinates</span>
                )}
                {canEdit && (
                  <button
                    type="button"
                    aria-label={`Delete ${p.name}`}
                    onClick={() => {
                      removePlace(p.id)
                      toast.success('Place removed.')
                    }}
                    className="p-1.5 rounded-lg text-[#B84E42] hover:bg-[#FCECEB]"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <EnterpriseModal open={open} onClose={() => setOpen(false)} title="Add a place">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="pl-name" className="dm-label">Name *</label>
              <input id="pl-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="dm-input" />
            </div>
            <div>
              <label htmlFor="pl-kind" className="dm-label">Type</label>
              <select id="pl-kind" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as PlaceKind })} className="dm-input">
                {KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="pl-city" className="dm-label">City *</label>
              <input id="pl-city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="dm-input" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="pl-addr" className="dm-label">Address</label>
              <input id="pl-addr" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="dm-input" />
            </div>
            <div>
              <label htmlFor="pl-lat" className="dm-label">Latitude</label>
              <input id="pl-lat" inputMode="decimal" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} placeholder="13.0827" className="dm-input tabular-nums" />
            </div>
            <div>
              <label htmlFor="pl-lng" className="dm-label">Longitude</label>
              <input id="pl-lng" inputMode="decimal" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} placeholder="80.2707" className="dm-input tabular-nums" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="pl-notes" className="dm-label">Notes</label>
              <textarea id="pl-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="dm-input" />
            </div>
          </div>
          <div className="flex justify-end gap-2.5 pt-1">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary text-xs">Cancel</button>
            <button type="submit" className="btn-primary text-xs">Save place</button>
          </div>
        </form>
      </EnterpriseModal>
    </div>
  )
}
