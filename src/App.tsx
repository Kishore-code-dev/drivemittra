import React, { Component, lazy, Suspense, type ComponentType } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { FleetProvider, useFleet } from './hooks/useFleet'
import { I18nProvider } from './i18n/useTranslation'
import Layout from './components/layout/Layout'
import { AccessDeniedState } from './components/ui/EnterprisePrimitives'
import { BrandLogo } from './components/ui/BrandLogo'
import { canAccessRoute, getDefaultHomeForRole } from './utils/rbac'
import Landing from './pages/Landing'
import Auth from './pages/Auth'
import ForcePasswordChange from './pages/ForcePasswordChange'
import Dashboard from './pages/Dashboard'
import NotFound from './pages/NotFound'

function lazyWithRetry<P extends object = Record<string, never>>(
  importer: () => Promise<{ default: ComponentType<P> }>,
) {
  return lazy(async () => {
    try {
      return await importer()
    } catch (firstErr) {
      await new Promise((resolve) => setTimeout(resolve, 250))
      try {
        return await importer()
      } catch (secondErr) {
        if (typeof window !== 'undefined') {
          const reloadKey = 'drivemitra_chunk_reload'
          if (!window.sessionStorage.getItem(reloadKey)) {
            window.sessionStorage.setItem(reloadKey, '1')
            window.location.reload()
          }
        }
        throw secondErr ?? firstErr
      }
    }
  })
}

const PlatformAdmin = lazyWithRetry(() => import('./pages/PlatformAdmin'))
const LiveMap = lazyWithRetry(() => import('./pages/LiveMap'))
const Trips = lazyWithRetry(() => import('./pages/Trips'))
const Vehicles = lazyWithRetry(() => import('./pages/Vehicles'))
const VehicleDetails = lazyWithRetry(() => import('./pages/VehicleDetails'))
const Drivers = lazyWithRetry(() => import('./pages/Drivers'))
const DriverDetails = lazyWithRetry(() => import('./pages/DriverDetails'))
const FuelLogs = lazyWithRetry(() => import('./pages/FuelLogs'))
const Maintenance = lazyWithRetry(() => import('./pages/Maintenance'))
const Inspections = lazyWithRetry(() => import('./pages/Inspections'))
const WorkOrders = lazyWithRetry(() => import('./pages/WorkOrders'))
const Inventory = lazyWithRetry(() => import('./pages/Inventory'))
const Workshops = lazyWithRetry(() => import('./pages/Workshops'))
const RiskRadar = lazyWithRetry(() => import('./pages/RiskRadar'))
const Financials = lazyWithRetry(() => import('./pages/Financials'))
const RoadIntelligence = lazyWithRetry(() => import('./pages/RoadIntelligence'))
const AlertsPage = lazyWithRetry(() => import('./pages/AlertsPage'))
const Reports = lazyWithRetry(() => import('./pages/Reports'))
const AdminConsole = lazyWithRetry(() => import('./pages/AdminConsole'))
const Settings = lazyWithRetry(() => import('./pages/Settings'))
const Reminders = lazyWithRetry(() => import('./pages/Reminders'))
const Issues = lazyWithRetry(() => import('./pages/Issues'))
const Places = lazyWithRetry(() => import('./pages/Places'))
const Subscription = lazyWithRetry(() => import('./pages/Subscription'))

class RouteErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#FFFFFF] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-[#FFFFFF] border border-[#E5E5E5] rounded-2xl p-8 text-center shadow-card space-y-4">
            <BrandLogo size="lg" className="mx-auto" />
            <h1 className="text-lg font-bold text-[#625346]">Workspace Module Interrupted</h1>
            <p className="text-xs text-[#958777] leading-relaxed">
              A navigation update occurred while loading this page. Reload to synchronize with the latest workspace build.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="btn-primary text-xs px-5 py-2.5"
            >
              Reload Workspace
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30000 } },
})

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-[#FFFFFF] flex items-center justify-center p-6">
      <div className="flex flex-col items-center gap-4">
        <BrandLogo size="xl" />
        <p className="text-xs text-[#958777]">Loading fleet workspace...</p>
        <div className="w-40 h-1.5 rounded-full overflow-hidden bg-[#E5E5E5]">
          <div className="h-full bg-[#E8C65A] animate-progress-flow w-full" />
        </div>
      </div>
    </div>
  )
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { loading, isAuthenticated, passwordChangeRequired, orgBlockedState, signOut } = useAuth()
  const location = useLocation()
  if (loading) return <LoadingScreen />

  if (orgBlockedState) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-[#E5E5E5] rounded-2xl p-8 shadow-card space-y-4 text-center">
          <BrandLogo size="lg" className="mx-auto" />
          <h1 className="text-lg font-bold text-[#625346]">Organization Access Restricted</h1>
          <p className="text-xs text-[#958777] leading-relaxed">
            Status: <span className="font-semibold uppercase text-[#D9786C]">{orgBlockedState.status}</span> —{' '}
            {orgBlockedState.reason}
          </p>
          <button type="button" onClick={() => void signOut()} className="btn-primary text-xs px-5 py-2.5">
            Return to Login
          </button>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />
  }

  if (passwordChangeRequired && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }

  return <>{children}</>
}

export function RoleProtectedRoute({ children }: { children: React.ReactNode }) {
  const { activeRole } = useFleet()
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const effectiveRole = user?.role ?? activeRole

  if (!canAccessRoute(effectiveRole, location.pathname)) {
    const fallback = getDefaultHomeForRole(effectiveRole)
    return (
      <div className="min-h-screen bg-[#FFFFFF]">
        <AccessDeniedState
          roleLabel={effectiveRole.replace('_', ' ')}
          targetPath={location.pathname}
          onReturn={() => navigate(fallback, { replace: true })}
        />
      </div>
    )
  }
  return <>{children}</>
}

function LegacyVehicleRedirect() {
  const { id } = useParams()
  return <Navigate to={id ? `/dashboard/fleet/vehicles/${id}` : '/dashboard/fleet'} replace />
}

export function AppRoutes() {
  return (
    <RouteErrorBoundary>
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/auth" element={<Auth />} />
          <Route
            path="/change-password"
            element={
              <ProtectedRoute>
                <ForcePasswordChange />
              </ProtectedRoute>
            }
          />
          <Route
            path="/platform-admin"
            element={
              <ProtectedRoute>
                <RoleProtectedRoute>
                  <PlatformAdmin />
                </RoleProtectedRoute>
              </ProtectedRoute>
            }
          />

          {/* Owner & Operations Enterprise Dashboard Workspace */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <RoleProtectedRoute>
                  <Layout />
                </RoleProtectedRoute>
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="map" element={<RoleProtectedRoute><LiveMap /></RoleProtectedRoute>} />
            <Route path="trips" element={<RoleProtectedRoute><Trips /></RoleProtectedRoute>} />
            <Route path="fleet" element={<RoleProtectedRoute><Vehicles /></RoleProtectedRoute>} />
            <Route path="fleet/vehicles/:vehicleId" element={<RoleProtectedRoute><VehicleDetails /></RoleProtectedRoute>} />
            <Route path="fleet/:id" element={<RoleProtectedRoute><VehicleDetails /></RoleProtectedRoute>} />
            <Route path="maintenance" element={<RoleProtectedRoute><Maintenance /></RoleProtectedRoute>} />
            <Route path="reminders" element={<RoleProtectedRoute><Reminders /></RoleProtectedRoute>} />
            <Route path="issues" element={<RoleProtectedRoute><Issues /></RoleProtectedRoute>} />
            <Route path="places" element={<RoleProtectedRoute><Places /></RoleProtectedRoute>} />
            <Route path="inspections" element={<RoleProtectedRoute><Inspections /></RoleProtectedRoute>} />
            <Route path="work-orders" element={<RoleProtectedRoute><WorkOrders /></RoleProtectedRoute>} />
            <Route path="inventory" element={<RoleProtectedRoute><Inventory /></RoleProtectedRoute>} />
            <Route path="workshops" element={<RoleProtectedRoute><Workshops /></RoleProtectedRoute>} />
            <Route path="risk" element={<RoleProtectedRoute><RiskRadar /></RoleProtectedRoute>} />
            <Route path="drivers" element={<RoleProtectedRoute><Drivers /></RoleProtectedRoute>} />
            <Route path="drivers/:driverId" element={<RoleProtectedRoute><DriverDetails /></RoleProtectedRoute>} />
            <Route path="fleet/drivers/:driverId" element={<RoleProtectedRoute><DriverDetails /></RoleProtectedRoute>} />
            <Route path="roads" element={<RoleProtectedRoute><RoadIntelligence /></RoleProtectedRoute>} />
            <Route path="fuel" element={<RoleProtectedRoute><FuelLogs /></RoleProtectedRoute>} />
            <Route path="financials" element={<RoleProtectedRoute><Financials /></RoleProtectedRoute>} />
            <Route path="reports" element={<RoleProtectedRoute><Reports /></RoleProtectedRoute>} />
            <Route path="alerts" element={<RoleProtectedRoute><AlertsPage /></RoleProtectedRoute>} />
            <Route path="admin" element={<RoleProtectedRoute><AdminConsole /></RoleProtectedRoute>} />
            <Route path="subscription" element={<RoleProtectedRoute><Subscription /></RoleProtectedRoute>} />
            <Route path="settings" element={<RoleProtectedRoute><Settings /></RoleProtectedRoute>} />
            <Route path="settings/:section" element={<RoleProtectedRoute><Settings /></RoleProtectedRoute>} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>

          {/* Legacy / Convenience Redirects */}
          <Route path="/map" element={<Navigate to="/dashboard/map" replace />} />
          <Route path="/vehicles" element={<Navigate to="/dashboard/fleet" replace />} />
          <Route path="/vehicles/:id" element={<LegacyVehicleRedirect />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </RouteErrorBoundary>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <AuthProvider>
          <FleetProvider>
            <BrowserRouter>
              <AppRoutes />
              <Toaster
                position="bottom-right"
                theme="light"
                toastOptions={{
                  style: {
                    background: '#FFFFFF',
                    border: '1px solid #E5E5E5',
                    color: '#625346',
                    borderRadius: '10px',
                    fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
                  },
                }}
              />
            </BrowserRouter>
          </FleetProvider>
        </AuthProvider>
      </I18nProvider>
    </QueryClientProvider>
  )
}
