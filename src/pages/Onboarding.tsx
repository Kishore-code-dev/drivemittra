import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Check, CloudLightning, Eye, EyeOff, FileText, ShieldCheck, Users, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../hooks/useAuth'
import { BrandLogo } from '../components/ui/BrandLogo'
import { canAccessRoute } from '../utils/rbac'
import type { SubscriptionPlanId } from '../types/fleet'

type OnboardingStep = 'welcome' | 'fleet_details' | 'staff_assignment' | 'subscription'

interface FleetDetailsData {
  fleetName: string
  businessName: string
  fleetEmail: string
  businessMobile: string
  location: string
  state: string
  city: string
  pinCode: string
  businessType: string
  servicesProvided: string[]
  operatingCategory: string
}

interface StaffData {
  fullName: string
  mobile: string
  email: string
  username: string
  designation: string
}

const SERVICES_OPTIONS = [
  'Passenger Transportation',
  'Employee Transportation',
  'Logistics',
  'Goods Transportation',
  'Rental Vehicles',
  'School Transportation',
  'Travel and Tourism',
  'Construction Transportation',
  'Contract Transportation',
  'Other',
]

const BUSINESS_TYPES = ['Private Limited', 'Partnership', 'LLP', 'Proprietorship', 'Government', 'Other']

const SUBSCRIPTION_PLANS = [
  {
    id: 'monthly_basic',
    name: 'Go Premium - Monthly Plan',
    price: '₹3,500',
    period: '/ month',
    tagline: 'Start Smart, Scale Fast',
    description: 'Power your fleet with industry-leading software',
    features: [
      'Fleet management dashboard',
      'Live fleet monitoring',
      'Vehicle & driver management',
      'Trip planning & tracking',
      'Maintenance & finance management',
      'Reports & operational records',
      'All available DriveMitra owner modules',
    ],
    cta: 'Get Started Today',
  },
  {
    id: 'annual_basic',
    name: 'Go Premium - Annual Plan',
    price: '₹36,000',
    period: '/ year',
    tagline: 'Save More, Operate Smarter',
    description: 'Best Value - Lock in 14.3% savings with annual billing',
    features: [
      'Full Fleet Owner access',
      'All monthly subscription features',
      'One-year validity',
      'Lower effective cost: ₹3,000/mo equiv.',
      'Save ₹6,000 vs 12 monthly payments',
    ],
    highlight: true,
    cta: 'Save ₹6,000 - Choose Annual',
  },
]

export default function Onboarding() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('welcome')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [fleetDetails, setFleetDetails] = useState<FleetDetailsData>({
    fleetName: '',
    businessName: '',
    fleetEmail: '',
    businessMobile: '',
    location: '',
    state: '',
    city: '',
    pinCode: '',
    businessType: '',
    servicesProvided: [],
    operatingCategory: '',
  })

  const [staffData, setStaffData] = useState<StaffData>({
    fullName: '',
    mobile: '',
    email: '',
    username: '',
    designation: '',
  })

  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlanId>('monthly_basic')

  // Check if user is already onboarded (has fleet_id but no full details)
  const isOnboarded = user?.role === 'org_admin' && user?.organizationId

  if (isOnboarded) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white border border-[#E5E5E5] rounded-2xl p-8 text-center">
          <BrandLogo size="lg" className="mx-auto mb-5" />
          <h1 className="text-2xl font-bold text-[#625346]">Already Onboarded</h1>
          <p className="text-sm text-[#958777] mt-3">Your organization workspace is ready.</p>
          <Link to="/dashboard" className="btn-primary mt-6">
            Go to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  const handleFleetDetailsSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fleetDetails.fleetName || !fleetDetails.businessName || !fleetDetails.fleetEmail) {
      toast.error('Please complete all required fields')
      return
    }
    setCurrentStep('staff_assignment')
  }

  const handleStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!staffData.fullName || !staffData.mobile || !staffData.email) {
      toast.error('Please complete all required fields')
      return
    }
    setCurrentStep('subscription')
  }

  const handleCompleteOnboarding = async () => {
    setIsSubmitting(true)
    try {
      const response = await fetch('/api/fleet/self-register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fleetName: fleetDetails.fleetName,
          businessName: fleetDetails.businessName,
          businessEmail: fleetDetails.fleetEmail,
          businessMobile: fleetDetails.businessMobile,
          city: fleetDetails.city,
          state: fleetDetails.state,
          pinCode: fleetDetails.pinCode,
          businessType: fleetDetails.businessType,
          servicesProvided: fleetDetails.servicesProvided,
          plannedStaff: {
            fullName: staffData.fullName,
            mobile: staffData.mobile,
            email: staffData.email,
            designation: staffData.designation,
          },
          selectedPlan,
        }),
      })

      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create account')
      }
      
      toast.success('Account created successfully!')
      
      // Store credentials for display on password change page
      if (data.ownerCredentials) {
        localStorage.setItem('dm_onboarding_creds', JSON.stringify({
          username: data.ownerCredentials.username,
          tempPassword: data.ownerCredentials.temporaryPassword,
          staffCredentials: data.staffCredentials,
          organization: data.organization,
        }))
      }

      // Redirect to change password
      navigate('/change-password', { replace: true, state: { fromOnboarding: true } })
    } catch (error: any) {
      toast.error(error?.message || error?.response?.data?.error || 'Failed to create account. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#FFFFFF]">
      {/* Header */}
      <header className="bg-[#FFFFFF] border-b border-[#E5E5E5] px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
        <Link to="/" aria-label="DriveMitra Home" className="flex items-center shrink-0">
          <BrandLogo size="header" />
        </Link>
        {currentStep !== 'welcome' && (
          <button
            type="button"
            onClick={() => setCurrentStep('welcome')}
            className="flex items-center gap-1.5 text-xs font-semibold text-[#6E5696] hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </button>
        )}
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left Panel */}
          <div className="lg:col-span-5 bg-[#EEE8F7] border border-[#DDD3ED] text-[#625346] rounded-2xl p-7 sm:p-8 shadow-card flex flex-col justify-between">
            <div>
              <BrandLogo size="lg" className="mb-5" />
              <h1 className="text-2xl font-bold text-[#625346]">
                DriveMitra Fleet Onboarding
              </h1>
              <p className="text-sm text-[#625346]/85 mt-3 leading-relaxed">
                Set up your fleet organization in just a few steps. You'll be guided through creating your fleet profile, team, and selecting a subscription plan.
              </p>
              
              <div className="mt-6 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#B8A3D9] text-white flex items-center justify-center text-sm font-bold">1</div>
                  <p className="text-sm text-[#625346]">Fleet Details - Enter your business information</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#B8A3D9] text-white flex items-center justify-center text-sm font-bold">2</div>
                  <p className="text-sm text-[#625346]">Staff Assignment - Create your operational team</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#B8A3D9] text-white flex items-center justify-center text-sm font-bold">3</div>
                  <p className="text-sm text-[#625346]">Subscription - Choose your plan</p>
                </div>
              </div>
            </div>

            <div className="mt-8 space-y-3 text-xs text-[#625346] border-t border-[#DDD3ED] pt-6">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#4D6E4A] shrink-0" />
                <span>Secure organization data with tenant isolation</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-[#6E5696] shrink-0" />
                <span>Staff accounts managed by Fleet Owner</span>
              </div>
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#6E5696] shrink-0" />
                <span>Subscription verified before full access</span>
              </div>
            </div>
          </div>

          {/* Right Panel - Form Content */}
          <div className="lg:col-span-7 enterprise-card p-6 sm:p-8 flex flex-col justify-center">
            {currentStep === 'welcome' && (
              <div className="space-y-6">
                <div className="text-center">
                  <div className="w-16 h-16 bg-[#E8C65A] rounded-full flex items-center justify-center mx-auto mb-4">
                    <Check className="w-8 h-8 text-[#625346]" />
                  </div>
                  <h2 className="text-xl font-bold text-[#625346]">Welcome to DriveMitra!</h2>
                  <p className="text-sm text-[#958777] mt-2">
                    Let's set up your fleet organization. Answer a few questions to get started.
                  </p>
                </div>
                <button
                  onClick={() => setCurrentStep('fleet_details')}
                  className="w-full btn-primary py-3"
                >
                  Continue to Fleet Details
                </button>
              </div>
            )}

            {currentStep === 'fleet_details' && (
              <form onSubmit={handleFleetDetailsSubmit} className="space-y-4">
                <h2 className="text-xl font-bold text-[#625346]">Fleet Details</h2>
                <p className="text-xs text-[#958777]">Enter your business information</p>

                <div>
                  <label className="dm-label">Fleet Name *</label>
                  <input
                    type="text"
                    value={fleetDetails.fleetName}
                    onChange={(e) => setFleetDetails({ ...fleetDetails, fleetName: e.target.value })}
                    className="dm-input"
                    placeholder="e.g., Chennai Urban Logistics"
                    required
                  />
                </div>

                <div>
                  <label className="dm-label">Business Name *</label>
                  <input
                    type="text"
                    value={fleetDetails.businessName}
                    onChange={(e) => setFleetDetails({ ...fleetDetails, businessName: e.target.value })}
                    className="dm-input"
                    placeholder="e.g., Chennai Urban Logistics Pvt Ltd"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="dm-label">Fleet Email *</label>
                    <input
                      type="email"
                      value={fleetDetails.fleetEmail}
                      onChange={(e) => setFleetDetails({ ...fleetDetails, fleetEmail: e.target.value })}
                      className="dm-input"
                      placeholder="owner@fleet.com"
                      required
                    />
                  </div>
                  <div>
                    <label className="dm-label">Business Mobile *</label>
                    <input
                      type="tel"
                      value={fleetDetails.businessMobile}
                      onChange={(e) => setFleetDetails({ ...fleetDetails, businessMobile: e.target.value })}
                      className="dm-input"
                      placeholder="+91 98470 11223"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="dm-label">Location/City *</label>
                    <input
                      type="text"
                      value={fleetDetails.city}
                      onChange={(e) => setFleetDetails({ ...fleetDetails, city: e.target.value })}
                      className="dm-input"
                      placeholder="Chennai"
                      required
                    />
                  </div>
                  <div>
                    <label className="dm-label">State *</label>
                    <input
                      type="text"
                      value={fleetDetails.state}
                      onChange={(e) => setFleetDetails({ ...fleetDetails, state: e.target.value })}
                      className="dm-input"
                      placeholder="Tamil Nadu"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="dm-label">PIN Code</label>
                  <input
                    type="text"
                    value={fleetDetails.pinCode}
                    onChange={(e) => setFleetDetails({ ...fleetDetails, pinCode: e.target.value })}
                    className="dm-input"
                    placeholder="600001"
                  />
                </div>

                <div>
                  <label className="dm-label">Business Type</label>
                  <select
                    value={fleetDetails.businessType}
                    onChange={(e) => setFleetDetails({ ...fleetDetails, businessType: e.target.value })}
                    className="dm-input"
                  >
                    <option value="">Select business type</option>
                    {BUSINESS_TYPES.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="dm-label">Services Provided</label>
                  <select
                    multiple
                    value={fleetDetails.servicesProvided}
                    onChange={(e) => {
                      const options = Array.from(e.target.selectedOptions, (opt) => opt.value)
                      setFleetDetails({ ...fleetDetails, servicesProvided: options })
                    }}
                    className="dm-input h-auto"
                    placeholder="Select services"
                  >
                    {SERVICES_OPTIONS.map((service) => (
                      <option key={service} value={service}>{service}</option>
                    ))}
                  </select>
                  <p className="text-xs text-[#958777] mt-1">Hold Ctrl/Cmd to select multiple</p>
                </div>

                <button type="submit" className="w-full btn-primary py-3">
                  Continue to Staff Assignment
                </button>
              </form>
            )}

            {currentStep === 'staff_assignment' && (
              <form onSubmit={handleStaffSubmit} className="space-y-4">
                <h2 className="text-xl font-bold text-[#625346]">Staff Assignment</h2>
                <p className="text-xs text-[#958777]">Add your operational team. At least one staff account is required.</p>

                <div className="bg-[#EDF4EC] border border-[#789A75] rounded-lg p-4 text-xs text-[#4D6E4A]">
                  <strong className="block mb-1">Note:</strong> The first staff member will be assigned full operational permissions. Additional staff can be added later.
                </div>

                <div>
                  <label className="dm-label">Full Name *</label>
                  <input
                    type="text"
                    value={staffData.fullName}
                    onChange={(e) => setStaffData({ ...staffData, fullName: e.target.value })}
                    className="dm-input"
                    placeholder="Priya Sundar"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="dm-label">Mobile Number *</label>
                    <input
                      type="tel"
                      value={staffData.mobile}
                      onChange={(e) => setStaffData({ ...staffData, mobile: e.target.value })}
                      className="dm-input"
                      placeholder="+91 98470 12345"
                      required
                    />
                  </div>
                  <div>
                    <label className="dm-label">Email Address *</label>
                    <input
                      type="email"
                      value={staffData.email}
                      onChange={(e) => setStaffData({ ...staffData, email: e.target.value })}
                      className="dm-input"
                      placeholder="priya@fleet.com"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="dm-label">Username (for login)</label>
                  <input
                    type="text"
                    value={staffData.username}
                    onChange={(e) => setStaffData({ ...staffData, username: e.target.value })}
                    className="dm-input"
                    placeholder="priya.sundar"
                  />
                </div>

                <div>
                  <label className="dm-label">Designation</label>
                  <input
                    type="text"
                    value={staffData.designation}
                    onChange={(e) => setStaffData({ ...staffData, designation: e.target.value })}
                    className="dm-input"
                    placeholder="Fleet Manager"
                  />
                </div>

                <button type="submit" className="w-full btn-primary py-3">
                  Continue to Subscription
                </button>
              </form>
            )}

            {currentStep === 'subscription' && (
              <div className="space-y-6">
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-[#625346] mb-2">
                    Choose Your Plan
                  </h2>
                  <p className="text-xs text-[#958777]">
                    Unlock your fleet management potential with DriveMitra
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {SUBSCRIPTION_PLANS.map((plan) => (
                    <label
                      key={plan.id}
                      className={`border-2 rounded-2xl p-6 cursor-pointer transition-all flex flex-col h-full ${
                        selectedPlan === plan.id
                          ? 'border-[#6E5696] bg-[#EEE8F7] shadow-lg'
                          : 'border-[#E5E5E5] hover:border-[#DDD3ED] hover:shadow-md'
                      }`}
                    >
                      <input
                        type="radio"
                        name="subscription"
                        className="sr-only"
                        checked={selectedPlan === plan.id}
                        onChange={() => setSelectedPlan(plan.id as SubscriptionPlanId)}
                      />
                      
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h3 className="text-lg font-bold text-[#625346] mb-1">{plan.tagline}</h3>
                          <p className="text-sm text-[#625346]/80">{plan.description}</p>
                        </div>
                        {plan.highlight && (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-[12px] font-bold text-[#625346] bg-[#E8C65A] border border-[#D8B442] animate-pulse">
                            🔥 Popular Choice
                          </span>
                        )}
                      </div>
                      
                      <div className="text-center py-4 mb-4 bg-white rounded-xl border-2 border-[#E5E5E5]">
                        <div className="text-3xl font-bold text-[#625346] mb-1">{plan.price}</div>
                        <div className="text-xs text-[#958777] font-medium">{plan.period}</div>
                        {plan.id === 'annual_basic' && (
                          <div className="text-xs text-[#4D6E4A] font-semibold mt-1">
                            ✓ Save ₹6,000 instantly!
                          </div>
                        )}
                      </div>
                      
                      <ul className="space-y-2 mb-4 flex-1">
                        {plan.features.map((feature, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-sm text-[#625346]">
                            <Check className="w-4 h-4 text-[#789A75] shrink-0 mt-0.5" />
                            {feature}
                          </li>
                        ))}
                      </ul>
                      
                      <div className="mt-auto">
                        <button
                          type="button"
                          onClick={() => setSelectedPlan(plan.id as SubscriptionPlanId)}
                          className={`w-full py-3 rounded-lg font-semibold text-sm transition-all ${
                            selectedPlan === plan.id
                              ? 'bg-[#6E5696] text-white cursor-default'
                              : 'bg-white border-2 border-[#6E5696] text-[#6E5696] hover:bg-[#EEE8F7]'
                          }`}
                        >
                          {selectedPlan === plan.id ? '✓ Selected' : plan.cta}
                        </button>
                      </div>
                    </label>
                  ))}
                </div>

                <div className="bg-[#FCECEB] border border-[#D9786C] rounded-lg p-4 text-xs text-[#B84E42]">
                  <strong className="block mb-1">⏱️ Limited Time: Save ₹6,000 with Annual Plan!</strong>
                  Subscription activation requires verified payment. DriveMitra will contact you to complete the payment process. Your fleet workspace will be fully activated upon payment confirmation.
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setCurrentStep('staff_assignment')}
                    className="btn-secondary text-xs px-4 py-2"
                    disabled={isSubmitting}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="btn-primary text-xs px-4 py-2"
                    onClick={handleCompleteOnboarding}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Creating Account...' : 'Complete Registration'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}