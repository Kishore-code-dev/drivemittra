import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Copy, Plus, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useFleet } from '../hooks/useFleet'
import { INTELLIGENCE_MODEL_VERSION } from '../utils/intelligenceEngine'
import { SUBSCRIPTION_PLANS } from '../data/seedOrganizations'
import { canPerformAction } from '../utils/rbac'
import { EnterpriseModal, formatDateTime, SeverityText } from '../components/ui/EnterprisePrimitives'
import type { OrganizationRole } from '../types/fleet'
import PageHeader from '../components/layout/PageHeader'

const ADMIN_TABS = [
  'Organizations',
  'Users & RBAC',
  'Vehicles',
  'Drivers',
  'Subscriptions',
  'AI Predictions',
  'Model Monitoring',
  'Alerts',
  'Audit Logs',
  'System Settings',
] as const

type AdminTab = (typeof ADMIN_TABS)[number]

export default function AdminConsole() {
  const navigate = useNavigate()
  const {
    organizations,
    activeOrganization,
    activeRole,
    setActiveOrganizationId,
    members,
    inviteMember,
    updateMemberRole,
    vehicles,
    drivers,
    predictions,
    alerts,
    auditLogs,
    settings,
    updateSettings,
  } = useFleet()

  const [tab, setTab] = useState<AdminTab>('Organizations')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteBusy, setInviteBusy] = useState(false)
  const [issuedCreds, setIssuedCreds] = useState<{
    username: string
    temporaryPassword: string
    fullName: string
  } | null>(null)
  const [copiedCred, setCopiedCred] = useState(false)
  const [inviteForm, setInviteForm] = useState({
    fullName: '',
    email: '',
    role: 'fleet_manager' as OrganizationRole,
  })

  const canManageMembers = canPerformAction(activeRole, 'manage_members')
  const canUpdateGlobal = canPerformAction(activeRole, 'update_global_settings')

  const validPreds = predictions.filter((p) => !p.insufficientData)
  const avgConfidence =
    validPreds.length > 0
      ? Math.round((validPreds.reduce((s, p) => s + p.confidenceScore, 0) / validPreds.length) * 100)
      : 0

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteForm.fullName.trim() || !inviteForm.email.includes('@')) {
      toast.error('Please enter valid full name and email.')
      return
    }
    setInviteBusy(true)
    try {
      const result = await inviteMember(
        inviteForm.fullName.trim(),
        inviteForm.email.trim(),
        inviteForm.role,
      )
      setInviteOpen(false)
      if (result.temporaryCredentials) {
        setIssuedCreds({
          username: result.temporaryCredentials.username,
          temporaryPassword: result.temporaryCredentials.temporaryPassword,
          fullName: inviteForm.fullName.trim(),
        })
      }
      setInviteForm({ fullName: '', email: '', role: 'fleet_manager' })
      toast.success('Added member to active organization.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to add member.')
    } finally {
      setInviteBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Administration Console" subtitle={<>{activeOrganization.name} · Owner Production Governance, RBAC & Audit Controls</>}>
        {activeRole === 'platform_admin' && (
          <button
            type="button"
            onClick={() => navigate('/platform-admin')}
            className="btn-secondary text-xs"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-[#6E5696]" />
            Open Super Admin Governance
          </button>
        )}
      </PageHeader>

      {issuedCreds && (
        <div className="enterprise-card p-4 border-l-4 border-l-[#6E5696] bg-[#EEE8F7]/60 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="space-y-1">
            <p className="font-bold text-[#625346]">
              Temporary Login Credentials Issued for {issuedCreds.fullName} (Shown Once)
            </p>
            <p className="text-[#625346] tabular-nums">
              Username: <strong>{issuedCreds.username}</strong> · Temporary Password:{' '}
              <strong>{issuedCreds.temporaryPassword}</strong>
            </p>
            <p className="text-[#958777]">User must change this password upon first sign-in.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                const text = `Username: ${issuedCreds.username}\nTemporary Password: ${issuedCreds.temporaryPassword}`
                try {
                  await navigator.clipboard.writeText(text)
                  setCopiedCred(true)
                  toast.success('Credentials copied')
                } catch {
                  toast.info(text)
                }
              }}
              className="btn-secondary text-xs"
            >
              {copiedCred ? <Check className="w-3.5 h-3.5 text-[#4D6E4A]" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedCred ? 'Copied' : 'Copy'}
            </button>
            <button
              type="button"
              onClick={() => setIssuedCreds(null)}
              className="btn-primary text-xs"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* 10 Admin Module Tabs */}
      <div className="border-b border-[#E5E5E5] overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max" role="tablist">
          {ADMIN_TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                tab === t ? 'border-[#6E5696] text-[#625346]' : 'border-transparent text-[#958777] hover:text-[#625346]'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === 'Organizations' && (
        <div className="space-y-4">
          {activeRole === 'platform_admin' && (
            <div className="flex justify-end">
              <button type="button" onClick={() => navigate('/platform-admin')} className="btn-primary text-xs">
                <Plus className="w-3.5 h-3.5" />
                Onboard Organization in Platform Admin
              </button>
            </div>
          )}
          <div className="enterprise-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="dm-table">
                <thead>
                  <tr><th>Organization</th><th>Code</th><th>Location</th><th>Plan</th><th>Limits (Veh / Drv)</th><th className="text-right">Status / Scope</th></tr>
                </thead>
                <tbody>
                  {organizations.map((org) => (
                    <tr key={org.id}>
                      <td className="font-semibold text-[#625346]">{org.name}</td>
                      <td className="tabular-nums text-xs">{org.code}</td>
                      <td className="text-xs text-[#958777]">{org.city}, {org.state}</td>
                      <td className="capitalize font-medium">{org.planId}</td>
                      <td className="tabular-nums text-xs">{org.vehicleLimit} / {org.driverLimit}</td>
                      <td className="text-right">
                        {org.id === activeOrganization.id ? (
                          <SeverityText severity="normal" label="Active Workspace" />
                        ) : activeRole === 'platform_admin' ? (
                          <button type="button" onClick={() => setActiveOrganizationId(org.id)} className="btn-secondary text-xs px-3 py-1">
                            Inspect
                          </button>
                        ) : (
                          <span className="text-xs text-[#958777]">Isolated</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'Users & RBAC' && (
        <div className="space-y-4">
          {canManageMembers && (
            <div className="flex justify-end">
              <button type="button" onClick={() => setInviteOpen(true)} className="btn-primary text-xs">
                <Plus className="w-3.5 h-3.5" />
                Add Staff Member
              </button>
            </div>
          )}
          <div className="enterprise-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="dm-table">
                <thead>
                  <tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last Active</th></tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id}>
                      <td className="font-semibold">{m.fullName}</td>
                      <td className="text-xs">{m.email}</td>
                      <td>
                        <select
                          value={m.role}
                          disabled={!canManageMembers || (m.role === 'platform_admin' && activeRole !== 'platform_admin')}
                          aria-label={`Role for ${m.fullName}`}
                          onChange={(e) => {
                            try {
                              updateMemberRole(m.id, e.target.value as OrganizationRole)
                              toast.success(`Updated role for ${m.fullName}.`)
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : 'Unable to update role.')
                            }
                          }}
                          className="dm-input py-1 text-xs w-auto disabled:opacity-60"
                        >
                          {(activeRole === 'platform_admin' || m.role === 'platform_admin') && (
                            <option value="platform_admin">Platform Admin</option>
                          )}
                          <option value="org_admin">Org Admin</option>
                          <option value="fleet_manager">Fleet Manager</option>
                          <option value="maintenance">Maintenance</option>
                          <option value="finance">Finance</option>
                          <option value="viewer">Viewer (Read-Only)</option>
                        </select>
                      </td>
                      <td><SeverityText severity="normal" label={m.status} /></td>
                      <td className="tabular-nums text-xs text-[#958777]">{formatDateTime(m.lastActiveAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'Vehicles' && (
        <div className="enterprise-card p-5 flex items-center justify-between gap-4">
          <div>
            <p className="font-bold text-[#625346]">{vehicles.length} Active Vehicles in {activeOrganization.name}</p>
            <p className="text-xs text-[#958777] mt-1">Manage vehicle digital twins, driver assignments, and decommissioning.</p>
          </div>
          <button type="button" onClick={() => navigate('/dashboard/fleet')} className="btn-primary text-xs">
            Open Fleet Directory
          </button>
        </div>
      )}

      {tab === 'Drivers' && (
        <div className="enterprise-card p-5 flex items-center justify-between gap-4">
          <div>
            <p className="font-bold text-[#625346]">{drivers.length} Owner-Managed Drivers Registered</p>
            <p className="text-xs text-[#958777] mt-1">Includes Indian commercial DL compliance master, document vault verification, and dispute resolution.</p>
          </div>
          <button type="button" onClick={() => navigate('/dashboard/drivers')} className="btn-primary text-xs">
            Open Driver Master Directory
          </button>
        </div>
      )}

      {tab === 'Subscriptions' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {SUBSCRIPTION_PLANS.map((p) => (
            <div key={p.id} className="enterprise-card p-5">
              <p className="font-bold text-[#625346]">{p.name}</p>
              <p className="text-xs text-[#958777] mt-1">Limit: {p.vehicleLimit} vehicles · {p.driverLimit} drivers</p>
              <button type="button" onClick={() => navigate('/dashboard/subscription')} className="btn-secondary text-xs mt-4">
                Manage Plan
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === 'AI Predictions' && (
        <div className="enterprise-card p-5 flex items-center justify-between gap-4">
          <div>
            <p className="font-bold text-[#625346]">{predictions.length} Active 5-Area Health Predictions</p>
            <p className="text-xs text-[#958777] mt-1">Deterministic wear model outputs across Fuel, Engine, Tyre, Driver & Vehicle areas.</p>
          </div>
          <button type="button" onClick={() => navigate('/dashboard/maintenance')} className="btn-primary text-xs">
            Inspect 5-Area Health
          </button>
        </div>
      )}

      {tab === 'Model Monitoring' && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="enterprise-card p-4">
            <span className="text-xs text-[#958777]">Active Model Version</span>
            <p className="text-sm font-bold text-[#625346] mt-1">{INTELLIGENCE_MODEL_VERSION}</p>
          </div>
          <div className="enterprise-card p-4">
            <span className="text-xs text-[#958777]">Mean Confidence</span>
            <p className="text-2xl font-bold text-[#6E5696] tabular-nums mt-1">{avgConfidence}%</p>
          </div>
          <div className="enterprise-card p-4">
            <span className="text-xs text-[#958777]">Open Predictions</span>
            <p className="text-2xl font-bold text-[#625346] tabular-nums mt-1">
              {predictions.filter((p) => p.status === 'open').length}
            </p>
          </div>
          <div className="enterprise-card p-4">
            <span className="text-xs text-[#958777]">Resolved Predictions</span>
            <p className="text-2xl font-bold text-[#625346] tabular-nums mt-1 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#789A75]" />
              {predictions.filter((p) => p.status === 'resolved').length}
            </p>
          </div>
        </div>
      )}

      {tab === 'Alerts' && (
        <div className="enterprise-card p-5 flex items-center justify-between gap-4">
          <div>
            <p className="font-bold text-[#625346]">{alerts.length} Organization Alerts</p>
            <p className="text-xs text-[#958777] mt-1">{alerts.filter((a) => !a.acknowledged).length} awaiting acknowledgement.</p>
          </div>
          <button type="button" onClick={() => navigate('/dashboard/alerts')} className="btn-primary text-xs">
            Open Alerts Feed
          </button>
        </div>
      )}

      {tab === 'Audit Logs' && (
        <div className="enterprise-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="dm-table">
              <thead>
                <tr><th>Actor</th><th>Role</th><th>Action</th><th>Summary</th><th>Timestamp</th></tr>
              </thead>
              <tbody>
                {auditLogs.map((l) => (
                  <tr key={l.id}>
                    <td className="font-semibold">{l.actorName}</td>
                    <td className="text-xs capitalize text-[#958777]">{l.actorRole.replace('_', ' ')}</td>
                    <td className="text-xs">{l.action}</td>
                    <td className="text-xs text-[#625346]">{l.summary}</td>
                    <td className="tabular-nums text-xs text-[#958777]">{formatDateTime(l.timestamp, activeOrganization.timezone)}</td>
                  </tr>
                ))}
                {auditLogs.length === 0 && (
                  <tr><td colSpan={5} className="text-center text-[#958777] py-8">No audit logs recorded yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'System Settings' && (
        <div className="enterprise-card p-6 space-y-4 max-w-xl">
          <h2 className="dm-card-title">Global Threshold Defaults</h2>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <label htmlFor="adm-conf" className="dm-label">AI Confidence Cutoff (%)</label>
              <input
                id="adm-conf"
                type="number"
                min={50}
                max={95}
                disabled={!canUpdateGlobal}
                value={settings.aiConfidenceThreshold}
                onChange={(e) => updateSettings({ aiConfidenceThreshold: Number(e.target.value) })}
                className="dm-input tabular-nums disabled:opacity-60"
              />
            </div>
            <div>
              <label htmlFor="adm-speed" className="dm-label">Highway Speed Ceiling (km/h)</label>
              <input
                id="adm-speed"
                type="number"
                min={50}
                max={120}
                disabled={!canUpdateGlobal}
                value={settings.speedCeilingKmh}
                onChange={(e) => updateSettings({ speedCeilingKmh: Number(e.target.value) })}
                className="dm-input tabular-nums disabled:opacity-60"
              />
            </div>
          </div>
          {canUpdateGlobal && (
            <button type="button" onClick={() => toast.success('System thresholds updated.')} className="btn-primary text-xs">
              Save Governance Thresholds
            </button>
          )}
        </div>
      )}

      <EnterpriseModal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Add Organization Staff Member">
        <form onSubmit={handleInviteMember} className="space-y-4">
          <div>
            <label htmlFor="inv-name" className="dm-label">Full Name *</label>
            <input id="inv-name" required value={inviteForm.fullName} onChange={(e) => setInviteForm((f) => ({ ...f, fullName: e.target.value }))} className="dm-input" />
          </div>
          <div>
            <label htmlFor="inv-email" className="dm-label">Work Email *</label>
            <input id="inv-email" type="email" required value={inviteForm.email} onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))} className="dm-input" />
          </div>
          <div>
            <label htmlFor="inv-role" className="dm-label">Role</label>
            <select id="inv-role" value={inviteForm.role} onChange={(e) => setInviteForm((f) => ({ ...f, role: e.target.value as OrganizationRole }))} className="dm-input">
              <option value="fleet_manager">Fleet Manager</option>
              <option value="org_admin">Organization Admin</option>
              <option value="maintenance">Maintenance</option>
              <option value="finance">Finance</option>
              <option value="viewer">Viewer (Read-Only)</option>
            </select>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setInviteOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={inviteBusy} className="btn-primary">
              {inviteBusy ? 'Provisioning...' : 'Provision Member'}
            </button>
          </div>
        </form>
      </EnterpriseModal>
    </div>
  )
}
