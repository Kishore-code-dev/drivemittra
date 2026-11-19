import React, { useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CheckCircle2, CreditCard, Info, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useFleet } from '../hooks/useFleet'
import { canPerformAction } from '../utils/rbac'
import {
  EnterpriseModal,
  formatDateTime,
  formatInr,
  SeverityText,
} from '../components/ui/EnterprisePrimitives'
import type { FinancialInvoice, PaymentRecord } from '../types/fleet'
import PageHeader from '../components/layout/PageHeader'

export default function Financials() {
  const {
    activeOrganization,
    activeRole,
    reportingPeriod,
    financialSummary,
    financialLedgerSummary,
    fuelTransactions,
    maintenanceRecords,
    invoices,
    payments,
    vehicles,
    nowTick,
    addFinancialInvoice,
    verifyFinancialInvoice,
    recordInvoicePayment,
  } = useFleet()

  const [showMethodology, setShowMethodology] = useState(false)
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false)
  const [paymentModalInvoice, setPaymentModalInvoice] = useState<FinancialInvoice | null>(null)

  const [invForm, setInvForm] = useState(() => ({
    invoiceNumber: `INV-${Math.floor(1000 + Math.random() * 8999)}`,
    vendorName: 'Sri Murugan Commercial Workshop',
    category: 'maintenance' as FinancialInvoice['category'],
    amountInr: 14500,
    dueDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    vehicleId: vehicles[0]?.id ?? '',
  }))

  const [payForm, setPayForm] = useState({
    amountInr: 0,
    paymentMethod: 'neft' as PaymentRecord['paymentMethod'],
    referenceNumber: '',
  })

  const canManageFinancials = canPerformAction(activeRole, 'manage_financials')

  const activeVehicleIds = new Set(vehicles.map((v) => v.id))
  const allDates = [
    ...fuelTransactions.map((t) => new Date(t.timestamp).getTime()),
    ...maintenanceRecords.map((m) => new Date(m.performedAt).getTime()),
  ].filter((ms) => Number.isFinite(ms))
  const anchorMs = allDates.length > 0 ? Math.max(...allDates) : nowTick
  const bucketSpanDays = reportingPeriod === '7d' ? 7 : reportingPeriod === '30d' ? 30 : 90
  const bucketSpanMs = bucketSpanDays * 86400000

  const monthlyTrend = [2, 1, 0].map((offset) => {
    const endMs = anchorMs - offset * bucketSpanMs + (offset === 0 ? 30 * 86400000 : 0)
    const startMs = anchorMs - (offset + 1) * bucketSpanMs
    const fuelSum = Math.round(
      fuelTransactions
        .filter((tx) => {
          if (!activeVehicleIds.has(tx.vehicleId)) return false
          const ms = new Date(tx.timestamp).getTime()
          return Number.isFinite(ms) && ms >= startMs && ms < (offset === 0 ? endMs + 1 : anchorMs - offset * bucketSpanMs)
        })
        .reduce((s, tx) => s + tx.amountInr, 0),
    )
    const maintSum = Math.round(
      maintenanceRecords
        .filter((m) => {
          if (!activeVehicleIds.has(m.vehicleId)) return false
          const ms = new Date(m.performedAt).getTime()
          return Number.isFinite(ms) && ms >= startMs && ms < (offset === 0 ? endMs + 1 : anchorMs - offset * bucketSpanMs)
        })
        .reduce((s, m) => s + m.costInr, 0),
    )
    return {
      month: offset === 0 ? `Current (${reportingPeriod.toUpperCase()})` : `W-${offset}`,
      fuel: offset === 0 ? financialSummary.fuelExpenditureInr : fuelSum,
      maint: offset === 0 ? financialSummary.maintenanceExpenditureInr : maintSum,
    }
  })

  const handleCreateInvoice = (e: React.FormEvent) => {
    e.preventDefault()
    try {
      addFinancialInvoice({
        invoiceNumber: invForm.invoiceNumber.trim(),
        vendorName: invForm.vendorName.trim(),
        category: invForm.category,
        amountInr: Number(invForm.amountInr),
        issuedDate: new Date().toISOString().slice(0, 10),
        dueDate: invForm.dueDate,
        vehicleId: invForm.vehicleId || undefined,
      })
      toast.success('Vendor invoice recorded in ledger.')
      setInvoiceModalOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to record invoice.')
    }
  }

  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault()
    if (!paymentModalInvoice) return
    try {
      recordInvoicePayment({
        invoiceId: paymentModalInvoice.id,
        amountInr: Number(payForm.amountInr),
        paymentMethod: payForm.paymentMethod,
        referenceNumber: payForm.referenceNumber,
      })
      toast.success(`Payment recorded against ${paymentModalInvoice.invoiceNumber}.`)
      setPaymentModalInvoice(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to record payment.')
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Financial Intelligence & Ledger" subtitle={<>{activeOrganization.name} · Period {reportingPeriod.toUpperCase()} · Recorded / Verified / Paid separation in INR (₹)</>}>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowMethodology((s) => !s)}
            className="btn-secondary text-xs"
          >
            <Info className="w-3.5 h-3.5 text-[#6E5696]" />
            {showMethodology ? 'Hide Calculation Methodology' : 'View Calculation Methodology'}
          </button>
          {canManageFinancials && (
            <button
              type="button"
              onClick={() => setInvoiceModalOpen(true)}
              className="btn-primary text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              Record Vendor Invoice
            </button>
          )}
        </div>
      </PageHeader>

      {showMethodology && (
        <div className="lavender-surface p-5 space-y-2 text-xs text-[#625346]">
          <p className="font-bold text-[#625346]">Financial Intelligence Calculation Methodology</p>
          <ul className="list-disc pl-5 space-y-1 text-[#958777]">
            {financialSummary.methodologyNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
            <li>
              Recorded / Verified / Paid Ledger ensures approved invoices never double-count completed Work Orders.
            </li>
          </ul>
        </div>
      )}

      {/* Recorded / Verified / Paid Control Buckets */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="enterprise-card p-4 border-l-4 border-l-[#D8B442]">
          <span className="text-xs font-semibold text-[#958777]">Recorded (Awaiting Verification)</span>
          <p className="text-xl font-bold text-[#625346] tabular-nums mt-1.5">
            {formatInr(financialLedgerSummary.recordedInvoicesInr)}
          </p>
          <p className="text-[11px] text-[#958777] mt-1">
            {invoices.filter((i) => i.status === 'recorded').length} invoice(s) pending review
          </p>
        </div>
        <div className="enterprise-card p-4 border-l-4 border-l-[#6E5696]">
          <span className="text-xs font-semibold text-[#958777]">Verified Payables</span>
          <p className="text-xl font-bold text-[#6E5696] tabular-nums mt-1.5">
            {formatInr(financialLedgerSummary.verifiedInvoicesInr)}
          </p>
          <p className="text-[11px] text-[#958777] mt-1">Cleared for settlement</p>
        </div>
        <div className="enterprise-card p-4 border-l-4 border-l-[#789A75]">
          <span className="text-xs font-semibold text-[#958777]">Paid & Settled</span>
          <p className="text-xl font-bold text-[#4D6E4A] tabular-nums mt-1.5">
            {formatInr(financialLedgerSummary.paidInvoicesInr)}
          </p>
          <p className="text-[11px] text-[#958777] mt-1">{payments.length} payment(s) logged</p>
        </div>
        <div className="enterprise-card p-4 border-l-4 border-l-[#D9786C]">
          <span className="text-xs font-semibold text-[#958777]">Net Outstanding Payables</span>
          <p className="text-xl font-bold text-[#B85245] tabular-nums mt-1.5">
            {formatInr(financialLedgerSummary.outstandingPayablesInr)}
          </p>
          <p className="text-[11px] text-[#958777] mt-1">Zero Work Order double-counting</p>
        </div>
      </div>

      {/* Primary Financial KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <div className="enterprise-card p-4">
          <span className="text-xs font-semibold text-[#958777]">Fuel / Energy Spend</span>
          <p className="text-xl font-bold text-[#625346] tabular-nums mt-1.5">
            {formatInr(financialSummary.fuelExpenditureInr)}
          </p>
        </div>
        <div className="enterprise-card p-4">
          <span className="text-xs font-semibold text-[#958777]">Maintenance Spend</span>
          <p className="text-xl font-bold text-[#625346] tabular-nums mt-1.5">
            {formatInr(financialSummary.maintenanceExpenditureInr)}
          </p>
        </div>
        <div className="enterprise-card p-4">
          <span className="text-xs font-semibold text-[#958777]">Operating Expenditure</span>
          <p className="text-xl font-bold text-[#6E5696] tabular-nums mt-1.5">
            {formatInr(financialSummary.operatingExpenditureInr)}
          </p>
        </div>
        <div className="enterprise-card p-4">
          <span className="text-xs font-semibold text-[#958777]">Blended Cost / km</span>
          <p className="text-xl font-bold text-[#625346] tabular-nums mt-1.5">
            ₹{financialSummary.costPerKmInr}
          </p>
        </div>
        <div className="enterprise-card p-4">
          <span className="text-xs font-semibold text-[#958777]">Est. Downtime Exposure</span>
          <p className="text-xl font-bold text-[#625346] tabular-nums mt-1.5 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#D9786C]" />
            {formatInr(financialSummary.estimatedDowntimeCostInr)}
          </p>
        </div>
        <div className="enterprise-card p-4">
          <span className="text-xs font-semibold text-[#958777]">Est. Potential Savings</span>
          <p className="text-xl font-bold text-[#625346] tabular-nums mt-1.5 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#789A75]" />
            {formatInr(financialSummary.estimatedPotentialSavingsInr)}
          </p>
        </div>
      </div>

      {/* Vendor Invoices & Settlement Table */}
      <div className="enterprise-card overflow-hidden">
        <div className="px-5 py-4 bg-[#FFFFFF] border-b border-[#E5E5E5] flex items-center justify-between gap-2">
          <div>
            <h2 className="dm-card-title">Vendor Invoices & Settlement Ledger</h2>
            <p className="text-xs text-[#958777]">Verify workshop, spare-part, and compliance bills prior to payout</p>
          </div>
          <span className="text-xs font-semibold text-[#958777] tabular-nums">{invoices.length} invoices</span>
        </div>
        <div className="overflow-x-auto">
          <table className="dm-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Vendor</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Paid</th>
                <th>Due Date</th>
                <th>Status</th>
                {canManageFinancials && <th className="text-right">Action</th>}
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const remaining = Math.max(0, inv.amountInr - inv.paidAmountInr)
                return (
                  <tr key={inv.id}>
                    <td className="font-bold text-[#625346] tabular-nums">{inv.invoiceNumber}</td>
                    <td className="font-medium text-[#625346]">{inv.vendorName}</td>
                    <td className="capitalize text-xs text-[#958777]">{inv.category.replace(/_/g, ' ')}</td>
                    <td className="font-semibold tabular-nums">{formatInr(inv.amountInr)}</td>
                    <td className="tabular-nums text-xs text-[#4D6E4A]">{formatInr(inv.paidAmountInr)}</td>
                    <td className="tabular-nums text-xs text-[#958777]">{inv.dueDate}</td>
                    <td>
                      <SeverityText
                        severity={inv.status === 'paid' ? 'normal' : inv.status === 'verified' ? 'moderate' : 'high'}
                        label={inv.status.replace('_', ' ')}
                      />
                    </td>
                    {canManageFinancials && (
                      <td className="text-right space-x-2 whitespace-nowrap">
                        {inv.status === 'recorded' && (
                          <button
                            type="button"
                            onClick={() => {
                              verifyFinancialInvoice(inv.id)
                              toast.success(`Verified ${inv.invoiceNumber} for payment.`)
                            }}
                            className="btn-secondary text-xs px-2.5 py-1 inline-flex items-center gap-1"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#6E5696]" />
                            Verify
                          </button>
                        )}
                        {remaining > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setPayForm({
                                amountInr: remaining,
                                paymentMethod: 'neft',
                                referenceNumber: '',
                              })
                              setPaymentModalInvoice(inv)
                            }}
                            className="btn-primary text-xs px-2.5 py-1 inline-flex items-center gap-1"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                            Pay
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={canManageFinancials ? 8 : 7} className="text-center text-[#958777] py-8">
                    No vendor invoices recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ICE vs EV Comparison + Monthly Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 enterprise-card p-5">
          <h2 className="dm-card-title">Expenditure Trend (Fuel vs Maintenance)</h2>
          <p className="text-xs text-[#958777] mb-4">Three-window rolling expenditure breakdown in INR</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: '#958777', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#958777', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Bar dataKey="fuel" name="Fuel / Charging (₹)" fill="#E8C65A" radius={[4, 4, 0, 0]} />
                <Bar dataKey="maint" name="Maintenance (₹)" fill="#B8A3D9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-5 enterprise-card p-5 space-y-4">
          <div>
            <h2 className="dm-card-title">ICE vs EV Operating Comparison</h2>
            <p className="text-xs text-[#958777]">Per-kilometer energy & service spend by powertrain</p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-[#FFFFFF] border border-[#E5E5E5] rounded-[10px] p-4 space-y-1.5">
              <span className="font-semibold text-[#958777]">ICE Fleet ({financialSummary.iceVsEv.iceCount})</span>
              <p className="text-xl font-bold text-[#625346] tabular-nums">
                ₹{financialSummary.iceVsEv.iceCostPerKmInr}/km
              </p>
              <p className="text-[#958777]">Avg Health: {financialSummary.iceVsEv.iceAvgHealth}%</p>
            </div>
            <div className="border border-[#789A75] bg-[#789A75]/20 rounded-[10px] p-4 space-y-1.5">
              <span className="font-semibold text-[#625346]">EV Fleet ({financialSummary.iceVsEv.evCount})</span>
              <p className="text-xl font-bold text-[#625346] tabular-nums">
                ₹{financialSummary.iceVsEv.evCostPerKmInr}/km
              </p>
              <p className="text-[#625346]/85">Avg Health: {financialSummary.iceVsEv.evAvgHealth}%</p>
            </div>
          </div>

          <p className="text-xs text-[#958777] leading-relaxed">
            Estimated maintenance savings are planning projections derived from fixing high-priority components before reactive roadside failure.
          </p>
        </div>
      </div>

      {/* Vehicle Cost Breakdown Table */}
      <div className="enterprise-card overflow-hidden">
        <div className="px-5 py-4 bg-[#FFFFFF] border-b border-[#E5E5E5]">
          <h2 className="dm-card-title">Vehicle Cost Comparison</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="dm-table">
            <thead>
              <tr>
                <th>Registration</th>
                <th>Powertrain</th>
                <th>Fuel / Charging</th>
                <th>Maintenance</th>
                <th>Total Operating</th>
                <th>Est. Distance</th>
                <th>Cost / km</th>
              </tr>
            </thead>
            <tbody>
              {financialSummary.vehicleCostBreakdown.map((row) => (
                <tr key={row.vehicleId}>
                  <td className="font-bold text-[#625346] tabular-nums">{row.registrationNumber}</td>
                  <td>{row.powertrain}</td>
                  <td className="tabular-nums">{formatInr(row.fuelSpendInr)}</td>
                  <td className="tabular-nums">{formatInr(row.maintenanceSpendInr)}</td>
                  <td className="font-bold tabular-nums">{formatInr(row.totalSpendInr)}</td>
                  <td className="tabular-nums">{row.distanceKm.toLocaleString('en-IN')} km</td>
                  <td className="font-semibold tabular-nums text-[#6E5696]">₹{row.costPerKmInr}/km</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Payments History */}
      {payments.length > 0 && (
        <div className="enterprise-card p-5">
          <h2 className="dm-card-title mb-3">Recent Settlement Payments</h2>
          <div className="divide-y divide-[#E5E5E5]/70 text-xs">
            {payments.slice(0, 6).map((p) => (
              <div key={p.id} className="py-2.5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="font-bold text-[#625346] tabular-nums">{p.invoiceNumber}</span>
                  <span className="text-[#958777] ml-2">· {p.paymentMethod} · Ref {p.referenceNumber}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-[#4D6E4A] tabular-nums">{formatInr(p.amountInr)}</span>
                  <span className="text-[#958777] tabular-nums">{formatDateTime(p.paidAt, activeOrganization.timezone)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Record Invoice Modal */}
      <EnterpriseModal open={invoiceModalOpen} onClose={() => setInvoiceModalOpen(false)} title="Record Vendor Invoice">
        <form onSubmit={handleCreateInvoice} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="inv-num" className="dm-label">Invoice Number *</label>
              <input id="inv-num" required value={invForm.invoiceNumber} onChange={(e) => setInvForm((f) => ({ ...f, invoiceNumber: e.target.value }))} className="dm-input" />
            </div>
            <div>
              <label htmlFor="inv-cat" className="dm-label">Category</label>
              <select id="inv-cat" value={invForm.category} onChange={(e) => setInvForm((f) => ({ ...f, category: e.target.value as FinancialInvoice['category'] }))} className="dm-input">
                <option value="maintenance">Workshop Maintenance</option>
                <option value="parts_po">Spare Parts Purchase</option>
                <option value="fuel">Fuel / EV Charging</option>
                <option value="compliance">Compliance & Permits</option>
                <option value="insurance">Insurance</option>
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="inv-vendor" className="dm-label">Vendor / Workshop *</label>
            <input id="inv-vendor" required value={invForm.vendorName} onChange={(e) => setInvForm((f) => ({ ...f, vendorName: e.target.value }))} className="dm-input" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="inv-amt" className="dm-label">Amount (INR) *</label>
              <input id="inv-amt" type="number" min={1} required value={invForm.amountInr} onChange={(e) => setInvForm((f) => ({ ...f, amountInr: Number(e.target.value) }))} className="dm-input tabular-nums" />
            </div>
            <div>
              <label htmlFor="inv-due" className="dm-label">Due Date *</label>
              <input id="inv-due" type="date" required value={invForm.dueDate} onChange={(e) => setInvForm((f) => ({ ...f, dueDate: e.target.value }))} className="dm-input" />
            </div>
          </div>
          <div className="flex justify-end gap-2.5 pt-2">
            <button type="button" onClick={() => setInvoiceModalOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Record Invoice</button>
          </div>
        </form>
      </EnterpriseModal>

      {/* Record Payment Modal */}
      <EnterpriseModal
        open={Boolean(paymentModalInvoice)}
        onClose={() => setPaymentModalInvoice(null)}
        title={`Record Payment · ${paymentModalInvoice?.invoiceNumber ?? ''}`}
      >
        <form onSubmit={handleRecordPayment} className="space-y-4">
          <div>
            <label htmlFor="pay-amt" className="dm-label">Payment Amount (INR) *</label>
            <input
              id="pay-amt"
              type="number"
              min={1}
              required
              value={payForm.amountInr}
              onChange={(e) => setPayForm((f) => ({ ...f, amountInr: Number(e.target.value) }))}
              className="dm-input tabular-nums"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="pay-method" className="dm-label">Payment Method</label>
              <select
                id="pay-method"
                value={payForm.paymentMethod}
                onChange={(e) => setPayForm((f) => ({ ...f, paymentMethod: e.target.value as PaymentRecord['paymentMethod'] }))}
                className="dm-input"
              >
                <option value="neft">NEFT</option>
                <option value="rtgs">RTGS</option>
                <option value="upi">UPI</option>
                <option value="cheque">Cheque</option>
                <option value="fleet_card">Corporate Fleet Card</option>
              </select>
            </div>
            <div>
              <label htmlFor="pay-ref" className="dm-label">UTR / Reference #</label>
              <input
                id="pay-ref"
                value={payForm.referenceNumber}
                onChange={(e) => setPayForm((f) => ({ ...f, referenceNumber: e.target.value }))}
                placeholder="UTR / Txn ID"
                className="dm-input"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2.5 pt-2">
            <button type="button" onClick={() => setPaymentModalInvoice(null)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Confirm Payment</button>
          </div>
        </form>
      </EnterpriseModal>
    </div>
  )
}
