import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCheck, Search } from 'lucide-react'
import { toast } from 'sonner'
import { useFleet } from '../hooks/useFleet'
import { canPerformAction } from '../utils/rbac'
import { EmptySectionState, formatDateTime, SeverityText } from '../components/ui/EnterprisePrimitives'
import PageHeader from '../components/layout/PageHeader'

export default function AlertsPage() {
  const navigate = useNavigate()
  const { activeOrganization, activeRole, vehicles, alerts, markAllAlertsRead, acknowledgeAlert } = useFleet()
  const [filter, setFilter] = useState<'all' | 'unread' | 'critical'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const canAcknowledge = canPerformAction(activeRole, 'acknowledge_alert')

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return alerts.filter((a) => {
      if (filter === 'unread' && a.read) return false
      if (filter === 'critical' && a.severity !== 'critical' && a.severity !== 'high') return false
      if (!q) return true
      const veh = vehicles.find((v) => v.id === a.vehicleId)
      return (
        a.title.toLowerCase().includes(q) ||
        a.message.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q) ||
        (a.source ?? '').toLowerCase().includes(q) ||
        (veh?.registrationNumber ?? a.vehicleId).toLowerCase().includes(q)
      )
    })
  }, [alerts, filter, searchQuery, vehicles])

  return (
    <div className="space-y-6">
      <PageHeader title="Operational Alerts" subtitle={<>{activeOrganization.name} · Real-time maintenance, telemetry, driver, and fuel exceptions</>}>
        {canAcknowledge && (
          <button
            type="button"
            onClick={() => {
              try {
                markAllAlertsRead()
                toast.success('All alerts marked read.')
              } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Unable to mark alerts read.')
              }
            }}
            className="btn-secondary text-xs"
          >
            <CheckCheck className="w-4 h-4 text-[#4D6E4A]" />
            Mark All Read
          </button>
        )}
      </PageHeader>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="p-1.5 flex items-center gap-1 w-fit bg-[#EEE8F7] border border-[#DDD3ED] rounded-[10px]">
          {(['all', 'unread', 'critical'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={`px-3 py-1 rounded-[8px] text-xs font-semibold capitalize transition-colors ${
                filter === tab ? 'bg-[#FFFFFF] text-[#625346] shadow-subtle' : 'text-[#958777] hover:text-[#625346]'
              }`}
            >
              {tab === 'critical' ? 'Critical & High' : tab}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 text-[#958777] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search vehicle, issue, source..."
            aria-label="Search operational alerts"
            className="dm-input pl-9 py-1.5 text-xs"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptySectionState
          title="No operational alerts in this view"
          description="All alerts for the selected filter have been reviewed."
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((al) => {
            const vehicle = vehicles.find((v) => v.id === al.vehicleId)
            return (
              <div
                key={al.id}
                className={`enterprise-card p-5 flex flex-wrap items-start justify-between gap-4 ${
                  al.read ? 'opacity-85' : ''
                }`}
              >
                <div className="space-y-1.5 max-w-2xl">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <SeverityText severity={al.severity} />
                    <span className="font-bold text-[#625346] tabular-nums">
                      {vehicle?.registrationNumber ?? al.vehicleId}
                    </span>
                    <span className="text-[#958777]">·</span>
                    <span className="capitalize text-[#958777]">{al.category.replace('_', ' ')}</span>
                    {al.source && (
                      <span className="px-2 py-0.5 rounded bg-[#EEE8F7] border border-[#DDD3ED] text-[#625346] font-semibold text-[11px]">
                        Source: {al.source}
                      </span>
                    )}
                  </div>
                  <h2 className="dm-card-title">{al.title}</h2>
                  <p className="text-xs text-[#958777]">{al.message}</p>
                  <p className="text-[11px] tabular-nums text-[#958777]">
                    {formatDateTime(al.timestamp, activeOrganization.timezone)}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {!al.acknowledged && canAcknowledge && (
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          acknowledgeAlert(al.id)
                          toast.success('Alert acknowledged.')
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : 'Unable to acknowledge alert.')
                        }
                      }}
                      className="btn-secondary text-xs"
                    >
                      Acknowledge
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => navigate(al.actionRoute)}
                    className="btn-primary text-xs"
                  >
                    Inspect
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

