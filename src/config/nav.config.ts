import type { ComponentType } from 'react'
import {
  AlertTriangle, Cpu, FileSpreadsheet,
  Layers, LayoutDashboard, MapPin, Package,
  Wrench, Wallet, Settings as SettingsIcon, Briefcase,
} from 'lucide-react'

export type BadgeKey = 'maintenance' | 'risk' | 'workOrders' | 'alerts'
type Icon = ComponentType<{ className?: string }>

export interface NavLeaf {
  to: string
  labelKey: string // i18n key
  /** Optional plain label that overrides the translated one (avoids group/child name clashes) */
  label?: string
  icon?: Icon
  end?: boolean
  badge?: BadgeKey
}

export interface NavEntry {
  id: string
  icon: Icon
  /** Leaf entry */
  to?: string
  labelKey?: string
  end?: boolean
  badge?: BadgeKey
  /** Group entry (accordion) */
  label?: string
  children?: NavLeaf[]
}

export const MAIN_NAV: NavEntry[] = [
  { id: 'dashboard', to: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard, end: true },
  { id: 'map', to: '/dashboard/map', labelKey: 'nav.map', icon: MapPin },
  {
    id: 'fleet', label: 'Fleet', icon: Layers,
    children: [
      { to: '/dashboard/fleet', labelKey: 'nav.fleet', label: 'Vehicles' },
      { to: '/dashboard/drivers', labelKey: 'nav.drivers' },
      { to: '/dashboard/trips', labelKey: 'nav.trips' },
    ],
  },
  {
    id: 'maintenance', label: 'Maintenance', icon: Wrench,
    children: [
      { to: '/dashboard/maintenance', labelKey: 'nav.maintenance', label: 'Predictive Health', badge: 'maintenance' },
      { to: '/dashboard/inspections', labelKey: 'nav.inspections' },
      { to: '/dashboard/work-orders', labelKey: 'nav.work_orders', badge: 'workOrders' },
      { to: '/dashboard/workshops', labelKey: 'nav.workshops' },
    ],
  },
  { id: 'inventory', to: '/dashboard/inventory', labelKey: 'nav.inventory', icon: Package },
  {
    id: 'intelligence', label: 'Intelligence', icon: Cpu,
    children: [
      { to: '/dashboard/risk', labelKey: 'nav.risk', badge: 'risk' },
      { to: '/dashboard/roads', labelKey: 'nav.road_intel' },
    ],
  },
  {
    id: 'finance', label: 'Finance', icon: Wallet,
    children: [
      { to: '/dashboard/fuel', labelKey: 'nav.fuel' },
      { to: '/dashboard/financials', labelKey: 'nav.financials' },
    ],
  },
  { id: 'reports', to: '/dashboard/reports', labelKey: 'nav.reports', icon: FileSpreadsheet },
  { id: 'alerts', to: '/dashboard/alerts', labelKey: 'nav.alerts', icon: AlertTriangle, badge: 'alerts' },
  {
    id: 'platform', label: 'Platform', icon: Briefcase,
    children: [
      { to: '/dashboard/admin', labelKey: 'nav.admin' },
      { to: '/dashboard/subscription', labelKey: 'nav.subscription' },
    ],
  },
]

export const FOOTER_NAV: NavLeaf[] = [
  { to: '/dashboard/settings', labelKey: 'nav.settings', icon: SettingsIcon },
]

