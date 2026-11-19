import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { MAIN_NAV } from '../../config/nav.config'
import { useTranslation } from '../../i18n/useTranslation'

function useCrumbs() {
  const { pathname } = useLocation()
  const { t } = useTranslation()
  const match = (to: string) => pathname === to || pathname.startsWith(`${to}/`)
  for (const e of MAIN_NAV) {
    const leaf = e.children?.find((c) => match(c.to))
    if (leaf) return [{ label: e.label ?? '' }, { label: leaf.label ?? t(leaf.labelKey), to: leaf.to }]
    if (e.to && e.to !== '/dashboard' && match(e.to)) return [{ label: t(e.labelKey ?? ''), to: e.to }]
  }
  return []
}

export default function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: ReactNode
  children?: ReactNode
}) {
  const crumbs = useCrumbs()
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-[11px] font-medium text-[#958777] mb-1">
          <Link to="/dashboard" className="hover:text-[#6E5696]">Dashboard</Link>
          {crumbs.map((c) => (
            <span key={c.label} className="flex items-center gap-1">
              <ChevronRight className="w-3 h-3" />
              {c.to ? <Link to={c.to} className="hover:text-[#6E5696]">{c.label}</Link> : <span>{c.label}</span>}
            </span>
          ))}
        </nav>
        <h1 className="dm-page-title">{title}</h1>
        {subtitle && <p className="text-sm text-[#958777] mt-1">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}
