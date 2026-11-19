import type { OrganizationRole } from '../types/fleet'

export type FleetAction =
  | 'create_organization'
  | 'manage_platform_orgs'
  | 'manage_members'
  | 'add_vehicle'
  | 'edit_vehicle'
  | 'decommission_vehicle'
  | 'restore_vehicle'
  | 'assign_driver'
  | 'add_driver'
  | 'manage_driver_status'
  | 'verify_documents'
  | 'dispute_driver_event'
  | 'resolve_driver_dispute'
  | 'schedule_trip'
  | 'end_trip'
  | 'log_fuel'
  | 'verify_fuel'
  | 'schedule_maintenance'
  | 'complete_maintenance'
  | 'resolve_prediction'
  | 'manage_work_orders'
  | 'manage_inventory'
  | 'manage_workshops'
  | 'submit_inspection'
  | 'report_issue'
  | 'acknowledge_alert'
  | 'manage_financials'
  | 'manage_subscription'
  | 'update_org_settings'
  | 'update_global_settings'
  | 'update_telemetry'
  | 'export_reports'
  | 'use_copilot'

const ROLE_ACTIONS: Record<OrganizationRole, Set<FleetAction>> = {
  platform_admin: new Set<FleetAction>([
    'create_organization',
    'manage_platform_orgs',
    'manage_members',
    'add_vehicle',
    'edit_vehicle',
    'decommission_vehicle',
    'restore_vehicle',
    'assign_driver',
    'add_driver',
    'manage_driver_status',
    'verify_documents',
    'dispute_driver_event',
    'resolve_driver_dispute',
    'schedule_trip',
    'end_trip',
    'log_fuel',
    'verify_fuel',
    'schedule_maintenance',
    'complete_maintenance',
    'resolve_prediction',
    'manage_work_orders',
    'manage_inventory',
    'manage_workshops',
    'submit_inspection',
    'report_issue',
    'acknowledge_alert',
    'manage_financials',
    'manage_subscription',
    'update_org_settings',
    'update_global_settings',
    'update_telemetry',
    'export_reports',
    'use_copilot',
  ]),
  org_admin: new Set<FleetAction>([
    'manage_members',
    'add_vehicle',
    'edit_vehicle',
    'decommission_vehicle',
    'restore_vehicle',
    'assign_driver',
    'add_driver',
    'manage_driver_status',
    'verify_documents',
    'dispute_driver_event',
    'resolve_driver_dispute',
    'schedule_trip',
    'end_trip',
    'log_fuel',
    'verify_fuel',
    'schedule_maintenance',
    'complete_maintenance',
    'resolve_prediction',
    'manage_work_orders',
    'manage_inventory',
    'manage_workshops',
    'submit_inspection',
    'report_issue',
    'acknowledge_alert',
    'manage_financials',
    'manage_subscription',
    'update_org_settings',
    'update_telemetry',
    'export_reports',
    'use_copilot',
  ]),
  fleet_manager: new Set<FleetAction>([
    'add_vehicle',
    'edit_vehicle',
    'decommission_vehicle',
    'restore_vehicle',
    'assign_driver',
    'add_driver',
    'manage_driver_status',
    'verify_documents',
    'dispute_driver_event',
    'resolve_driver_dispute',
    'schedule_trip',
    'end_trip',
    'log_fuel',
    'verify_fuel',
    'schedule_maintenance',
    'complete_maintenance',
    'resolve_prediction',
    'manage_work_orders',
    'manage_inventory',
    'manage_workshops',
    'submit_inspection',
    'report_issue',
    'acknowledge_alert',
    'update_org_settings',
    'update_telemetry',
    'export_reports',
    'use_copilot',
  ]),
  maintenance: new Set<FleetAction>([
    'schedule_maintenance',
    'complete_maintenance',
    'resolve_prediction',
    'manage_work_orders',
    'manage_inventory',
    'manage_workshops',
    'submit_inspection',
    'report_issue',
    'acknowledge_alert',
    'export_reports',
    'use_copilot',
  ]),
  finance: new Set<FleetAction>([
    'log_fuel',
    'verify_fuel',
    'manage_financials',
    'manage_subscription',
    'export_reports',
    'use_copilot',
  ]),
  viewer: new Set<FleetAction>(['export_reports', 'use_copilot']),
}

export function canPerformAction(role: OrganizationRole, action: FleetAction): boolean {
  return ROLE_ACTIONS[role]?.has(action) ?? false
}

export function assertRolePermission(role: OrganizationRole, action: FleetAction): void {
  if (!canPerformAction(role, action)) {
    throw new Error(`Role "${role.replace(/_/g, ' ')}" is not authorized to perform "${action.replace(/_/g, ' ')}".`)
  }
}

export function getDefaultHomeForRole(role: OrganizationRole): string {
  if (role === 'platform_admin') return '/platform-admin'
  if (role === 'maintenance') return '/dashboard/maintenance'
  if (role === 'finance') return '/dashboard/financials'
  return '/dashboard'
}

export function canAccessRoute(role: OrganizationRole, pathname: string): boolean {
  const clean = pathname.replace(/\/+$/, '') || '/'

  if (clean.startsWith('/platform-admin')) {
    return role === 'platform_admin'
  }

  // Driver mobile companion app is permanently removed from the owner-only platform
  if (clean.startsWith('/driver')) {
    return false
  }

  if (!clean.startsWith('/dashboard')) {
    return true
  }

  if (clean === '/dashboard/admin') {
    return role === 'platform_admin' || role === 'org_admin'
  }

  if (clean === '/dashboard/subscription') {
    return role === 'platform_admin' || role === 'org_admin' || role === 'finance'
  }

  if (clean === '/dashboard/settings' || clean.startsWith('/dashboard/settings/')) {
    return role === 'platform_admin' || role === 'org_admin' || role === 'fleet_manager'
  }

  if (clean === '/dashboard/financials') {
    return (
      role === 'platform_admin' ||
      role === 'org_admin' ||
      role === 'fleet_manager' ||
      role === 'finance' ||
      role === 'viewer'
    )
  }

  if (
    clean === '/dashboard/maintenance' ||
    clean === '/dashboard/work-orders' ||
    clean === '/dashboard/inspections' ||
    clean === '/dashboard/reminders' ||
    clean === '/dashboard/places' ||
    clean === '/dashboard/issues' ||
    clean === '/dashboard/inventory' ||
    clean === '/dashboard/workshops'
  ) {
    return (
      role === 'platform_admin' ||
      role === 'org_admin' ||
      role === 'fleet_manager' ||
      role === 'maintenance' ||
      role === 'viewer'
    )
  }

  if (clean === '/dashboard/fuel') {
    return (
      role === 'platform_admin' ||
      role === 'org_admin' ||
      role === 'fleet_manager' ||
      role === 'finance' ||
      role === 'viewer'
    )
  }

  if (
    clean.startsWith('/dashboard/drivers') ||
    clean.startsWith('/dashboard/fleet/drivers') ||
    clean === '/dashboard/trips' ||
    clean === '/dashboard/map'
  ) {
    return (
      role === 'platform_admin' ||
      role === 'org_admin' ||
      role === 'fleet_manager' ||
      role === 'maintenance' ||
      role === 'viewer'
    )
  }

  return true
}
