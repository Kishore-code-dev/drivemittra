import React, { useCallback, useEffect, useState } from 'react'
import { CloudRain, Compass, RefreshCw, Thermometer, Wind } from 'lucide-react'
import { useFleet } from '../hooks/useFleet'
import { formatDateTime, SeverityText } from '../components/ui/EnterprisePrimitives'
import PageHeader from '../components/layout/PageHeader'

interface LiveCorridorWeather {
  corridorId: string
  city: string
  temperatureC: number
  windSpeedKmh: number | null
  precipitationMm: number | null
  condition: string
  source: string
  observedAt: string | null
}

export default function RoadIntelligence() {
  const { activeOrganization, corridors, vehicles, predictions } = useFleet()
  const [liveFeed, setLiveFeed] = useState<{
    loading: boolean
    live: boolean
    provider: string
    fetchedAt: string | null
    byCorridorId: Record<string, LiveCorridorWeather>
  }>({
    loading: true,
    live: false,
    provider: 'Checking live climate telemetry...',
    fetchedAt: null,
    byCorridorId: {},
  })

  const fetchClimate = useCallback(async () => {
    setLiveFeed((prev) => ({ ...prev, loading: true }))
    try {
      const res = await fetch('/api/climate/corridors', { credentials: 'include' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as {
        live: boolean
        provider: string
        fetchedAt: string | null
        corridors: LiveCorridorWeather[]
      }
      const map: Record<string, LiveCorridorWeather> = {}
      for (const item of data.corridors ?? []) {
        map[item.corridorId] = item
      }
      setLiveFeed({
        loading: false,
        live: Boolean(data.live),
        provider: data.provider || 'Regional Baseline Model',
        fetchedAt: data.fetchedAt ?? null,
        byCorridorId: map,
      })
    } catch {
      setLiveFeed((prev) => ({
        ...prev,
        loading: false,
        live: false,
        provider: 'Regional Baseline Model (Live Weather Feed Unavailable)',
      }))
    }
  }, [])

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const res = await fetch('/api/climate/corridors', { credentials: 'include' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as {
          live: boolean
          provider: string
          fetchedAt: string | null
          corridors: LiveCorridorWeather[]
        }
        if (!active) return
        const map: Record<string, LiveCorridorWeather> = {}
        for (const item of data.corridors ?? []) {
          map[item.corridorId] = item
        }
        setLiveFeed({
          loading: false,
          live: Boolean(data.live),
          provider: data.provider || 'Regional Baseline Model',
          fetchedAt: data.fetchedAt ?? null,
          byCorridorId: map,
        })
      } catch {
        if (!active) return
        setLiveFeed((prev) => ({
          ...prev,
          loading: false,
          live: false,
          provider: 'Regional Baseline Model (Live Weather Feed Unavailable)',
        }))
      }
    })()
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="space-y-6">
      <PageHeader title="Corridor Stress & Climate Intelligence" subtitle={<>{activeOrganization.name} · Regional road stress and live climate multipliers applied in 5-area predictive wear models</>}>

        <button
          type="button"
          onClick={() => void fetchClimate()}
          disabled={liveFeed.loading}
          className="btn-secondary text-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${liveFeed.loading ? 'animate-spin' : ''}`} />
          Refresh Climate Feed
        </button>
      </PageHeader>

      <div
        className={`rounded-[12px] border px-4 py-3 text-xs flex flex-wrap items-center justify-between gap-2 ${
          liveFeed.live
            ? 'bg-[#789A75]/15 border-[#789A75] text-[#625346]'
            : 'bg-[#EEE8F7] border-[#DDD3ED] text-[#625346]'
        }`}
      >
        <div className="font-semibold flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${liveFeed.live ? 'bg-[#789A75]' : 'bg-[#D8B442]'}`} />
          <span>{liveFeed.provider}</span>
        </div>
        {liveFeed.fetchedAt && (
          <span className="text-[#958777] tabular-nums">
            Observed {formatDateTime(liveFeed.fetchedAt, activeOrganization.timezone)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {corridors.map((cor) => {
          const wx = liveFeed.byCorridorId[cor.id]
          const activeOnCorridor = vehicles.filter((v) => v.corridorId === cor.id)
          const elevatedRisks = predictions.filter(
            (p) =>
              !p.insufficientData &&
              p.status !== 'resolved' &&
              (p.priority === 'critical' || p.priority === 'high') &&
              activeOnCorridor.some((v) => v.id === p.vehicleId),
          )
          const sev = cor.roadStressIndex >= 0.7 ? 'critical' : cor.roadStressIndex >= 0.6 ? 'high' : 'normal'
          const tempDisplay = wx ? wx.temperatureC : cor.avgAmbientTempC

          return (
            <div key={cor.id} className="enterprise-card p-5 space-y-3 hover:bg-[#FFFFFF] transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="dm-card-title">{cor.name}</h2>
                  <p className="text-xs text-[#958777]">{cor.region}</p>
                </div>
                <SeverityText severity={sev} label={cor.potholeDensity} />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#E5E5E5] text-xs">
                <div>
                  <span className="text-[#958777] block">Road Stress Index</span>
                  <span className="text-base font-bold text-[#625346] tabular-nums">
                    {cor.roadStressIndex.toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-[#958777] block">Ambient Temp</span>
                  <span className="text-base font-bold text-[#625346] tabular-nums inline-flex items-center gap-1">
                    <Thermometer className="w-3.5 h-3.5 text-[#A56021]" />
                    {tempDisplay}°C
                  </span>
                </div>
              </div>

              {wx && (
                <div className="pt-2 border-t border-[#E5E5E5] space-y-1 text-xs">
                  <p className="font-semibold text-[#625346]">{wx.condition}</p>
                  <div className="flex items-center justify-between text-[#958777]">
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Wind className="w-3 h-3" />
                      {wx.windSpeedKmh !== null ? `${wx.windSpeedKmh} km/h` : '—'}
                    </span>
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <CloudRain className="w-3 h-3" />
                      {wx.precipitationMm !== null ? `${wx.precipitationMm} mm` : '—'}
                    </span>
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-[#E5E5E5] flex items-center justify-between text-xs text-[#958777]">
                <span className="inline-flex items-center gap-1">
                  <Compass className="w-3.5 h-3.5 text-[#6E5696]" />
                  {activeOnCorridor.length} vehicle(s)
                </span>
                <span className="font-semibold text-[#625346] tabular-nums">
                  {elevatedRisks.length} high/crit alerts
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
