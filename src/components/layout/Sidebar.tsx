import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { ChevronDown, LogOut, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { useFleet } from '../../hooks/useFleet'
import { useAuth } from '../../hooks/useAuth'
import { canAccessRoute } from '../../utils/rbac'
import { BrandLogo } from '../ui/BrandLogo'
import { useTranslation } from '../../i18n/useTranslation'
import { FOOTER_NAV, MAIN_NAV, type BadgeKey, type NavEntry, type NavLeaf } from '../../config/nav.config'

const OPEN_KEY = 'dm.nav.open'
const COLLAPSED_KEY = 'dm.nav.collapsed'

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable */
  }
}

function Badge({ value, active }: { value?: number; active?: boolean }) {
  if (!value) return null
  return (
    <span
      className={`text-xs font-semibold tabular-nums px-1.5 py-0.5 rounded-[6px] border bg-white ${
        active ? 'text-[#6E5696] border-[#B8A3D9]' : 'text-[#625346] border-[#DDD3ED]'
      }`}
    >
      {value}
    </span>
  )
}

const rowBase =
  'flex items-center gap-2.5 rounded-[10px] text-[13.5px] transition-colors whitespace-nowrap border'
const rowActive = 'bg-[#E1D7F2] text-[#6E5696] font-semibold border-[#B8A3D9] shadow-subtle'
const rowIdle = 'text-[#625346] font-medium border-transparent hover:bg-white/70'

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { unreadAlertCount, predictions, riskAssessments, workOrders, activeRole } = useFleet()
  const { signOut } = useAuth()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const [collapsed, setCollapsed] = useState<boolean>(() => load(COLLAPSED_KEY, false))
  const [openGroups, setOpenGroups] = useState<string[]>(() => load(OPEN_KEY, []))

  const badges: Record<BadgeKey, number> = {
    maintenance: predictions.filter(
      (p) => !p.insufficientData && p.status !== 'resolved' && (p.priority === 'critical' || p.priority === 'high'),
    ).length,
    risk: riskAssessments.filter((r) => r.severity === 'critical' || r.severity === 'high').length,
    workOrders: workOrders.filter((w) => w.status !== 'completed' && w.status !== 'closed').length,
    alerts: unreadAlertCount,
  }

  const allowed = (to: string) => canAccessRoute(activeRole, to)
  const entries = MAIN_NAV.map((e) =>
    e.children ? { ...e, children: e.children.filter((c) => allowed(c.to)) } : e,
  ).filter((e) => (e.children ? e.children.length > 0 : e.to && allowed(e.to)))
  const footer = FOOTER_NAV.filter((f) => allowed(f.to))

  const isInside = (e: NavEntry) =>
    !!e.children?.some((c) => pathname === c.to || pathname.startsWith(`${c.to}/`))

  // Auto-open the group that holds the active route
  useEffect(() => {
    const active = entries.find(isInside)
    if (active && !openGroups.includes(active.id)) {
      setOpenGroups((prev) => {
        const next = [...prev, active.id]
        save(OPEN_KEY, next)
        return next
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  const toggleGroup = (id: string) =>
    setOpenGroups((prev) => {
      const next = prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
      save(OPEN_KEY, next)
      return next
    })

  const toggleCollapsed = () =>
    setCollapsed((c) => {
      save(COLLAPSED_KEY, !c)
      return !c
    })

  const handleSignOut = async () => {
    await signOut()
    navigate('/auth', { replace: true })
  }

  // Rail mode only applies on desktop; the mobile drawer is always full width
  const rail = collapsed

  const renderLeaf = (leaf: NavLeaf | NavEntry, opts: { child?: boolean } = {}) => {
    const to = leaf.to as string
    const Icon = leaf.icon
    const label = (leaf as NavLeaf).label ?? t((leaf as NavLeaf).labelKey ?? '')
    const badge = (leaf as NavLeaf).badge ? badges[(leaf as NavLeaf).badge as BadgeKey] : 0
    return (
      <NavLink
        key={to}
        to={to}
        end={(leaf as NavEntry).end}
        onClick={onClose}
        title={rail ? label : undefined}
        className={({ isActive }) =>
          `${rowBase} ${opts.child ? 'px-2.5 py-1.5 text-[13px]' : 'px-2.5 py-2'} ${
            rail && !opts.child ? 'lg:justify-center' : 'justify-between'
          } ${isActive ? rowActive : rowIdle}`
        }
      >
        {({ isActive }) => (
          <>
            <span className="flex items-center gap-2.5 min-w-0">
              {Icon && <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#6E5696]' : 'text-[#958777]'}`} />}
              <span className={`truncate ${rail && !opts.child ? 'lg:hidden' : ''}`}>{label}</span>
            </span>
            <span className={rail && !opts.child ? 'lg:hidden' : ''}>
              <Badge value={badge} active={isActive} />
            </span>
          </>
        )}
      </NavLink>
    )
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-[#625346]/20 backdrop-blur-[1px] lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[268px] bg-[#EEE8F7] border-r border-[#DDD3ED] flex flex-col transition-all duration-200 lg:static lg:translate-x-0 shrink-0 ${
          rail ? 'lg:w-[72px]' : 'lg:w-[268px]'
        } ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="h-16 px-4 border-b border-[#DDD3ED] flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            aria-label="DriveMitra Command Centre"
            className="flex items-center gap-2.5 text-left min-w-0"
          >
            <BrandLogo size="md" />
            <div className={rail ? 'lg:hidden' : ''}>
              <span className="text-xs font-bold text-[#4D6E4A] block leading-tight">Production</span>
              <span className="text-[11px] text-[#958777] font-medium block">Owner ERP</span>
            </div>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation menu"
            className="lg:hidden p-1.5 rounded-lg text-[#625346] hover:bg-[#E2D8F3]"
          >
            <X className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={rail ? 'Expand sidebar' : 'Collapse sidebar'}
            className={`hidden lg:inline-flex p-1.5 rounded-lg text-[#958777] hover:bg-[#E2D8F3] ${rail ? 'lg:hidden' : ''}`}
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        {rail && (
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label="Expand sidebar"
            className="hidden lg:flex mx-auto mt-3 p-1.5 rounded-lg text-[#958777] hover:bg-[#E2D8F3]"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        )}

        <nav className="flex-1 overflow-y-auto scrollbar-custom px-3 py-3 space-y-0.5" aria-label="Dashboard navigation">
          {entries.map((entry) => {
            if (!entry.children) return renderLeaf(entry)

            const Icon = entry.icon
            const expanded = openGroups.includes(entry.id) && !rail
            const inside = isInside(entry)
            const panelId = `nav-group-${entry.id}`
            return (
              <div key={entry.id}>
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  title={rail ? entry.label : undefined}
                  onClick={() => (rail ? navigate(entry.children![0].to) : toggleGroup(entry.id))}
                  className={`${rowBase} w-full px-2.5 py-2 justify-between border-transparent hover:bg-white/70 ${
                    inside ? 'text-[#6E5696] font-semibold' : 'text-[#625346] font-medium'
                  } ${rail ? 'lg:justify-center' : ''}`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Icon className={`w-4 h-4 shrink-0 ${inside ? 'text-[#6E5696]' : 'text-[#958777]'}`} />
                    <span className={`truncate ${rail ? 'lg:hidden' : ''}`}>{entry.label}</span>
                  </span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 shrink-0 text-[#958777] transition-transform duration-150 ${
                      expanded ? 'rotate-180' : ''
                    } ${rail ? 'lg:hidden' : ''}`}
                  />
                </button>
                <div
                  id={panelId}
                  className={`grid transition-[grid-template-rows] duration-150 ease-out ${
                    expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                  } ${rail ? 'lg:hidden' : ''}`}
                >
                  <div className="overflow-hidden">
                    <div className="ml-[18px] mt-0.5 mb-1 pl-3 border-l border-[#DDD3ED] space-y-0.5">
                      {entry.children.map((c) => (
                        <div key={c.to} className={expanded ? '' : 'hidden'}>
                          {renderLeaf(c, { child: true })}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </nav>

        <div className="p-3 border-t border-[#DDD3ED] shrink-0 space-y-0.5">
          {footer.map((f) => renderLeaf(f))}
          <button
            type="button"
            onClick={handleSignOut}
            title={rail ? 'Sign Out' : undefined}
            className={`w-full ${rowBase} px-3 py-2 border-transparent hover:bg-[#FCECEB] text-[#625346] font-medium ${
              rail ? 'lg:justify-center' : ''
            }`}
          >
            <LogOut className="w-4 h-4 shrink-0 text-[#B84E42]" />
            <span className={rail ? 'lg:hidden' : ''}>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  )
}
