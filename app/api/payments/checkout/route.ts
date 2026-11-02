import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { authenticatePaymentRequest, isAuthorizedPrelaunchDemoUser } from '@/lib/payments/auth';
import { checkoutSchema } from '@/lib/payments/checkout-schema';
import { rupeesToPaise } from '@/lib/payments/security';
import {
  createRazorpayOrder,
  fetchRazorpayOrderPayments,
  fetchRazorpayOrderStatus,
  findRazorpayOrderByReceipt,
  getPaymentFeatureFlags,
  type PaymentKind,
} from '@/lib/razorpay';

function jsonError(message: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

async function ensureLinkedRazorpayOrder(
  admin: SupabaseClient,
  order: { id: string; userId: string; kind: PaymentKind; amountInPaise: number },
) {
  const existing = await findRazorpayOrderByReceipt(order.id);
  let providerOrderId: string;
  if (existing) {
    if (
      !existing.id
      || existing.amount !== order.amountInPaise
      || existing.currency !== 'INR'
      || existing.notes?.internalOrderId !== order.id
      || existing.notes?.userId !== order.userId
      || existing.notes?.kind !== order.kind
    ) throw new Error('A conflicting Razorpay order exists for this checkout receipt.');
    providerOrderId = existing.id;
  } else {
    const created = await createRazorpayOrder({
      amountInPaise: order.amountInPaise,
      receipt: order.id,
      notes: { internalOrderId: order.id, userId: order.userId, kind: order.kind },
    });
    if (
      created.notes.internalOrderId !== order.id
      || created.notes.userId !== order.userId
      || created.notes.kind !== order.kind
    ) throw new Error('Razorpay returned an order with unexpected checkout notes.');
    providerOrderId = created.id;
  }
  const { data: linked, error } = await admin.rpc('link_payment_provider_order', {
    p_order_id: order.id,
    p_user_id: order.userId,
    p_provider_order_id: providerOrderId,
  });
  if (error || linked !== true) throw new Error('Unable to link the Razorpay order to the internal payment order.');
  return providerOrderId;
}

export async function POST(request: Request) {
  const auth = await authenticatePaymentRequest(request);
  if (!auth) return jsonError('Authentication required.', 401);
  if (auth.unavailable) return jsonError('Payment database configuration is missing on the server.', 503);
  const { admin, user } = auth;

  const flags = getPaymentFeatureFlags();
  if (!flags.enabled || !flags.keyId) return jsonError('Payments are disabled or not configured.', 503);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid request body.', 400);
  }
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;
  let amountInPaise: number | null = null;
  let orderNotes: Record<string, unknown> = {};
  let item: {
    entityId: string;
    sellerId?: string;
    description: string;
    quantity: number;
    unitAmountInPaise: number;
    terms?: Record<string, unknown>;
  } | null = null;

  const isSimulatedDonation = input.kind === 'donation' && input.bplPatientId === undefined;
  const isDemoCheckout = Boolean(input.demoCatalogId) || isSimulatedDonation;
  let demoCatalog: {
    id: string;
    provider_label: string;
    service_name: string;
    description: string;
    amount_in_paise: number | string;
    pricing_unit: string;
    available_weekdays: number[];
    daily_start_time: string;
    daily_end_time: string;
  } | null = null;
  if (isDemoCheckout) {
    if (!flags.prelaunchDemoEnabled || !flags.demoPaymentsEnabled) {
      return jsonError('Pre-launch demo checkout is disabled by the server operator.', 403);
    }
    if (flags.mode === 'live' && (!flags.liveDemoPaymentsEnabled || !input.demoCatalogId)) {
      return jsonError('Live checkout is restricted to explicitly enabled, consented demo bookings. Donation collection is test-only.', 403);
    }
    try {
      if (!(await isAuthorizedPrelaunchDemoUser(user.id))) {
        return jsonError('This account is not authorized to make pre-launch demo payments.', 403);
      }
    } catch {
      return jsonError('Unable to verify pre-launch tester authorization.', 500);
    }
    if (input.demoDisclosureAccepted !== true) {
      return jsonError('Acknowledge the pre-launch demo disclosure before continuing.', 400);
    }
    if (flags.mode === 'live' && input.liveDemoConsent !== true) {
      return jsonError('Confirm the live amount and OncoCare+ merchant disclosure before continuing.', 400);
    }

    if (isSimulatedDonation) {
      if (flags.mode !== 'test' || input.demoCatalogId || !input.donationAmountInPaise) {
        return jsonError('Simulated donations are available only in Test Mode and never represent a charitable contribution.', 403);
      }
      amountInPaise = input.donationAmountInPaise;
      orderNotes = {
        isDemo: true,
        demoDisclosureVersion: 'prelaunch-demo-v1',
        simulatedDonation: true,
        charitableContribution: false,
        merchantDisclosure: 'Razorpay Test Mode; no charitable contribution',
      };
      item = {
        entityId: 'DEMO: simulated-campaign',
        description: 'DEMO: Simulated contribution - no beneficiary',
        quantity: 1,
        unitAmountInPaise: amountInPaise,
        terms: { simulated: true, charitableContribution: false },
      };
    } else {
      if (!input.demoCatalogId) return jsonError('Select a pre-launch demo item.', 400);
      const { data: catalogEntry, error: catalogError } = await admin.from('prelaunch_demo_catalog')
        .select('id, kind, provider_label, service_name, description, amount_in_paise, pricing_unit, available_weekdays, daily_start_time, daily_end_time, active')
        .eq('id', input.demoCatalogId)
        .eq('active', true)
        .maybeSingle();
      if (catalogError) return jsonError('Unable to validate the selected demo item.', 503);
      if (!catalogEntry || catalogEntry.kind !== input.kind || !catalogEntry.provider_label.startsWith('DEMO:') || !catalogEntry.service_name.startsWith('DEMO:')) {
        return jsonError('The selected item is not an active demo entry for this checkout type.', 409);
      }
      demoCatalog = catalogEntry;
      amountInPaise = Number(catalogEntry.amount_in_paise);
      if (!Number.isSafeInteger(amountInPaise) || amountInPaise <= 0) {
        return jsonError('The demo item has an invalid server-configured price.', 409);
      }
      if (['caregiver', 'booking', 'tele-oncology'].includes(input.kind)) {
        const requestedDate = input.bookingDate!;
        if (requestedDate < new Date().toISOString().slice(0, 10)) {
          return jsonError('Choose a current or future demo booking date.', 400);
        }
        const weekday = new Date(`${requestedDate}T00:00:00.000Z`).getUTCDay();
        if (!catalogEntry.available_weekdays.includes(weekday)) {
          return jsonError('The selected demo provider is not available on that date.', 409);
        }
        if (input.startTime! < String(catalogEntry.daily_start_time).slice(0, 5)
          || input.endTime! > String(catalogEntry.daily_end_time).slice(0, 5)
          || input.endTime! <= input.startTime!) {
          return jsonError('The selected time is outside this demo provider’s available hours.', 409);
        }
      }
      orderNotes = {
        isDemo: true,
        demoCatalogId: catalogEntry.id,
        demoDisclosureVersion: 'prelaunch-demo-v1',
        liveDemoConsent: flags.mode === 'live',
        providerLabel: catalogEntry.provider_label,
        serviceName: catalogEntry.service_name,
        requestedDate: input.bookingDate ?? null,
        requestedStartTime: input.startTime ?? null,
        requestedEndTime: input.endTime ?? null,
        location: input.location ?? null,
        demoDisclosure: catalogEntry.description,
      };
      item = {
        entityId: catalogEntry.id,
        description: catalogEntry.service_name,
        quantity: 1,
        unitAmountInPaise: amountInPaise,
        terms: { isDemo: true, pricingUnit: catalogEntry.pricing_unit, disclosureVersion: 'prelaunch-demo-v1' },
      };
    }
  }

  let stockProductId: string | null = null;
  let teleAppointmentDate: string | null = null;

  if (isDemoCheckout) {
    // Demo checkout details were validated above. They deliberately do not create real service entitlements or fulfilment records.
  } else if (input.kind === 'donation') {
    if (!input.bplPatientId || !input.donationAmountInPaise || !input.donorName || !input.donorEmail) {
      return jsonError('Choose a verified BPL campaign and enter a donation amount and donor details.', 400);
    }
    if (!flags.patientDonationsEnabled) {
      return jsonError('Patient donations are disabled by the payment operator. Enable PATIENT_DONATIONS_ENABLED after campaign and merchant approvals.', 403);
    }
    const { data: patient, error: patientError } = await admin.from('bpl_patients')
      .select('id, name, goal_amount, raised_amount, verified')
      .eq('id', input.bplPatientId)
      .eq('verified', true)
      .maybeSingle();
    if (patientError) return jsonError('Unable to verify the selected fundraising campaign.', 503);
    if (!patient) return jsonError('The selected fundraising campaign is not verified or is no longer available.', 409);
    const { data: verification, error: verificationError } = await admin.from('bpl_verification')
      .select('bpl_status_verified, medical_documents_verified, beneficiary_account_verified')
      .eq('patient_id', patient.id)
      .maybeSingle();
    if (verificationError) return jsonError('Unable to verify campaign approvals.', 503);
    if (!verification?.bpl_status_verified || !verification.medical_documents_verified || !verification.beneficiary_account_verified) {
      return jsonError('This campaign is not approved for payment: BPL status, medical documents, and beneficiary account must all be verified.', 409);
    }
    const remaining = Math.round((Number(patient.goal_amount) - Number(patient.raised_amount)) * 100);
    if (!Number.isSafeInteger(remaining) || remaining < 100 || input.donationAmountInPaise > remaining) {
      return jsonError('The donation amount exceeds the campaign’s remaining verified goal.', 409);
    }
    amountInPaise = input.donationAmountInPaise;
    orderNotes = {
      bplPatientId: patient.id,
      donorName: input.donorName,
      donorEmail: input.donorEmail,
      donationPurpose: 'Verified BPL cancer-treatment campaign contribution',
      merchantDisclosure: 'Funds are collected to the registered OncoCare+ Razorpay merchant account and disbursed separately.',
    };
    item = {
      entityId: `bpl-patient:${patient.id}`,
      description: `BPL treatment campaign donation: ${patient.name}`,
      quantity: 1,
      unitAmountInPaise: amountInPaise,
      terms: {
        campaignId: patient.id,
        processingFeeDisclosure: 'Funds are collected to the registered OncoCare+ Razorpay merchant account and disbursed separately.',
      },
    };
  } else if (input.kind === 'tele-oncology') {
    if (!flags.teleOncologyCallProviderEnabled) {
      return jsonError('Tele-oncology checkout is unavailable until a real consultation provider is configured.', 503);
    }
    if (!input.plan || !input.appointmentDate || !input.appointmentTime || !input.doctorName) {
      return jsonError('Select a tele-oncology plan and provide the appointment details.', 400);
    }
    if (new Date(input.appointmentDate).getTime() <= Date.now()) return jsonError('Choose a future appointment time.', 400);
    const { data: price, error: priceError } = await admin.from('payment_offers')
      .select('id, amount_in_paise, duration_days, included_usage, terms')
      .eq('kind', 'tele-oncology')
      .eq('entity_id', 'default')
      .eq('offer_type', input.plan)
      .eq('active', true)
      .or(`valid_from.is.null,valid_from.lte.${new Date().toISOString()}`)
      .or(`valid_until.is.null,valid_until.gt.${new Date().toISOString()}`)
      .maybeSingle();
    if (priceError) return jsonError('Unable to load tele-oncology pricing.', 500);
    if (!price || Number(price.included_usage) !== (input.plan === 'monthly' ? 35 : 1)) {
      return jsonError('Approved tele-oncology pricing or quota is not configured.', 409);
    }
    if (
      (input.plan === 'monthly' && Number(price.duration_days) !== 30)
      || (input.plan === 'one-time' && price.duration_days !== null)
    ) {
      return jsonError('Tele-oncology duration must match the approved one-time or 30-day monthly plan.', 409);
    }
    amountInPaise = Number(price.amount_in_paise);
    orderNotes = {
      plan: input.plan,
      offerId: price.id,
      offerAmountInPaise: Number(price.amount_in_paise),
      includedCalls: price.included_usage,
      durationDays: price.duration_days,
      appointmentDate: input.appointmentDate,
      appointmentTime: input.appointmentTime,
      doctorId: input.doctorId ?? null,
      doctorName: input.doctorName,
      reason: input.reason ?? `Tele-oncology consultation with ${input.doctorName}`,
      appointmentNotes: `Patient: ${input.patientName ?? ''}; phone: ${input.patientPhone ?? ''}; plan: ${input.plan}`,
    };
    teleAppointmentDate = input.appointmentDate;
    item = {
      entityId: `tele-oncology:${input.plan}`,
      description: input.plan === 'monthly' ? 'Monthly tele-oncology plan' : 'One-time tele-oncology consultation',
      quantity: 1,
      unitAmountInPaise: amountInPaise,
      terms: {
        offerId: price.id,
        includedCalls: Number(price.included_usage),
        durationDays: price.duration_days === null ? null : Number(price.duration_days),
      },
    };
  } else if (input.kind === 'caregiver') {
    if (!input.caregiverId || !input.serviceId || !input.bookingDate || !input.startTime || !input.endTime || !input.location) {
      return jsonError('Choose a caregiver, service, date, time, and location.', 400);
    }
    if (input.bookingDate < new Date().toISOString().slice(0, 10)) {
      return jsonError('Choose a current or future booking date.', 400);
    }
    const timeToMinutes = (value: string) => {
      const [hours, minutes] = value.split(':').map(Number);
      return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : null;
    };
    const startMinutes = timeToMinutes(input.startTime);
    const endMinutes = timeToMinutes(input.endTime);
    if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
      return jsonError('Choose a valid booking time range.', 400);
    }
    const { data: caregiver, error: caregiverError } = await admin.from('caregiver_profiles')
      .select('id, professional_title, is_available')
      .eq('id', input.caregiverId)
      .eq('is_active', true)
      .eq('verification_status', 'verified')
      .maybeSingle();
    if (caregiverError) return jsonError('Unable to validate the selected caregiver.', 500);
    if (!caregiver || !caregiver.is_available) {
      return jsonError('The selected caregiver is not currently verified and available for booking.', 409);
    }
    const { data: service, error: serviceError } = await admin.from('caregiver_services')
      .select('id, caregiver_id, service_name, price, pricing_unit')
      .eq('id', input.serviceId)
      .eq('caregiver_id', caregiver.id)
      .eq('is_active', true)
      .maybeSingle();
    if (serviceError) return jsonError('Unable to validate the selected caregiver service.', 500);
    if (!service) return jsonError('The selected service is no longer available.', 409);

    const weekday = new Date(`${input.bookingDate}T00:00:00.000Z`).getUTCDay();
    const { data: slots, error: availabilityError } = await admin.from('caregiver_availability')
      .select('start_time, end_time')
      .eq('caregiver_id', caregiver.id)
      .eq('day_of_week', weekday)
      .eq('is_available', true);
    if (availabilityError) return jsonError('Unable to validate caregiver availability.', 500);
    if (!(slots ?? []).some((slot) => (
      String(slot.start_time).slice(0, 5) <= input.startTime!
      && String(slot.end_time).slice(0, 5) >= input.endTime!
    ))) {
      return jsonError('The selected time is outside this caregiver’s available hours.', 409);
    }

    const unitPriceInPaise = rupeesToPaise(service.price);
    if (unitPriceInPaise === null) return jsonError('This service does not have a valid approved price.', 409);
    const pricingUnit = String(service.pricing_unit).trim().toLowerCase();
    let quantity = 1;
    if (['hour', 'hourly', 'per hour', 'per_hour'].includes(pricingUnit)) {
      const durationMinutes = endMinutes - startMinutes;
      if (durationMinutes % 60 !== 0 || durationMinutes > 12 * 60) {
        return jsonError('Hourly caregiver bookings must use whole hours and cannot exceed 12 hours.', 400);
      }
      quantity = durationMinutes / 60;
    } else if (!['day', 'daily', 'per day', 'per_day', 'visit', 'per visit', 'session', 'per session'].includes(pricingUnit)) {
      return jsonError('This caregiver service has an unsupported pricing unit and cannot be charged safely.', 409);
    }
    amountInPaise = unitPriceInPaise * quantity;
    if (!Number.isSafeInteger(amountInPaise) || amountInPaise <= 0) {
      return jsonError('The caregiver service total is invalid.', 409);
    }
    item = {
      entityId: service.id,
      description: service.service_name,
      quantity,
      unitAmountInPaise: unitPriceInPaise,
      terms: { caregiverId: caregiver.id, pricingUnit: service.pricing_unit },
    };
    orderNotes = {
      caregiverId: caregiver.id,
      caregiverTitle: caregiver.professional_title,
      serviceId: service.id,
      serviceName: service.service_name,
      bookingDate: input.bookingDate,
      startTime: input.startTime,
      endTime: input.endTime,
      location: input.location,
      requirements: input.reason ?? '',
      pricingUnit: service.pricing_unit,
      billedQuantity: quantity,
    };
  } else if (input.kind === 'medicine') {
    if (input.offerType && input.offerType !== 'one-time') {
      return jsonError('Medicine subscriptions are unavailable until subscription terms and fulfillment are approved.', 409);
    }
    if (!input.productId || !input.pharmacyId || !input.quantity || !input.deliveryAddress) {
      return jsonError('Product, pharmacy, quantity, and a delivery address are required.', 400);
    }
    const { data: product, error: productError } = await admin
      .from('pharmacy_products')
      .select('id, pharmacy_id, name, strength, form, selling_price, requires_prescription, is_active, pharmacy:pharmacy_orgs!inner(id, verification_status, accepts_online_orders, listing_enabled, home_delivery, online_delivery_fee_in_paise)')
      .eq('id', input.productId)
      .eq('pharmacy_id', input.pharmacyId)
      .eq('is_active', true)
      .maybeSingle();
    if (productError) return jsonError('Unable to validate the selected medicine.', 500);
    if (!product) return jsonError('The selected medicine or pharmacy is not approved for online checkout.', 409);
    const pharmacy = Array.isArray(product?.pharmacy) ? product.pharmacy[0] : product?.pharmacy;
    if (
      !pharmacy || pharmacy.verification_status !== 'verified'
      || !pharmacy.accepts_online_orders || !pharmacy.listing_enabled
      || !pharmacy.home_delivery || pharmacy.online_delivery_fee_in_paise === null
      || pharmacy.online_delivery_fee_in_paise === undefined
    ) {
      return jsonError('The selected medicine or pharmacy is not approved for online checkout.', 409);
    }
    if (product.requires_prescription) {
      if (!input.prescriptionId) return jsonError('A verified prescription is required for this medicine.', 400);
      const { data: prescription, error: prescriptionError } = await admin
        .from('pharmacy_prescriptions')
        .select('id')
        .eq('id', input.prescriptionId)
        .eq('pharmacy_id', input.pharmacyId)
        .eq('patient_id', user.id)
        .eq('status', 'verified')
        .maybeSingle();
      if (prescriptionError || !prescription) return jsonError('No verified prescription was found for this medicine.', 403);
    }
    const unitPrice = rupeesToPaise(product.selling_price);
    if (unitPrice === null) return jsonError('This medicine has no valid approved selling price.', 409);
    const subtotalInPaise = unitPrice * input.quantity;
    const deliveryFeeInPaise = Number(pharmacy.online_delivery_fee_in_paise);
    amountInPaise = subtotalInPaise + deliveryFeeInPaise;
    if (!Number.isSafeInteger(amountInPaise)) return jsonError('The calculated total is invalid.', 400);
    const { data: stock, error: stockError } = await admin
      .from('pharmacy_product_stock')
      .select('available')
      .eq('product_id', input.productId)
      .maybeSingle();
    if (stockError) return jsonError('Unable to validate current stock.', 500);
    if (!stock || Number(stock.available) < input.quantity) return jsonError('The requested quantity is not available.', 409);
    const { data: commissionPolicy, error: commissionError } = await admin.from('payment_commission_policies')
      .select('policy_version, basis_points')
      .eq('active', true)
      .maybeSingle();
    if (commissionError) return jsonError('Unable to validate the marketplace commission policy.', 500);
    if (!commissionPolicy) return jsonError('Medicine checkout is unavailable until an approved commission policy is configured.', 409);
    stockProductId = product.id;
    item = {
      entityId: product.id,
      sellerId: product.pharmacy_id,
      description: [product.name, product.strength, product.form].filter(Boolean).join(' '),
      quantity: input.quantity,
      unitAmountInPaise: unitPrice,
      terms: {
        commissionPolicyVersion: commissionPolicy.policy_version,
        commissionBasisPoints: commissionPolicy.basis_points,
        commissionableAmountInPaise: subtotalInPaise,
        deliveryFeeInPaise,
      },
    };
    orderNotes = {
      productId: product.id,
      pharmacyId: product.pharmacy_id,
      prescriptionId: input.prescriptionId ?? null,
      quantity: input.quantity,
      deliveryAddress: input.deliveryAddress,
    };
  } else if (input.kind === 'insurance') {
    if (!input.insurancePlanId || !input.offerType || input.offerType !== 'one-time') {
      if (input.offerType === 'subscription') {
        return jsonError('Recurring insurance subscriptions are unavailable until an approved Razorpay subscription plan and billing terms are configured.', 409);
      }
      return jsonError('An approved insurance plan and payment option are required.', 400);
    }
    const { data: plan, error: planError } = await admin
      .from('insurance_plans')
      .select('id, name, is_active')
      .eq('id', input.insurancePlanId)
      .eq('is_active', true)
      .maybeSingle();
    if (planError) return jsonError('Unable to validate insurance plan.', 500);
    if (!plan) return jsonError('The selected insurance plan is not active.', 409);
    const { data: offer, error: offerError } = await admin.from('payment_offers')
      .select('id, amount_in_paise, duration_days, included_usage, terms')
      .eq('kind', 'insurance')
      .eq('entity_id', plan.id)
      .eq('offer_type', input.offerType)
      .eq('active', true)
      .or(`valid_from.is.null,valid_from.lte.${new Date().toISOString()}`)
      .or(`valid_until.is.null,valid_until.gt.${new Date().toISOString()}`)
      .maybeSingle();
    if (offerError) return jsonError('Unable to load approved insurance pricing.', 500);
    if (!offer) return jsonError('Approved pricing is not configured for this insurance option.', 409);
    amountInPaise = Number(offer.amount_in_paise);
    item = { entityId: plan.id, description: plan.name, quantity: 1, unitAmountInPaise: amountInPaise, terms: { offerId: offer.id, durationDays: offer.duration_days, includedUsage: offer.included_usage, ...offer.terms } };
    orderNotes = { insurancePlanId: plan.id, offerId: offer.id, offerType: input.offerType };
  } else if (input.kind === 'booking') {
    if (!input.helperId || !input.offerType || !input.startDate || !input.patientName || !input.location) {
      return jsonError('A provider, approved booking option, start date, patient name, and location are required.', 400);
    }
    if (!['daily', 'monthly'].includes(input.offerType)) return jsonError('Unsupported home-care offer.', 400);
    const { data: helper, error: helperError } = await admin.from('cook_maid_helpers')
      .select('id, name, service, location, verified, is_demo')
      .eq('id', input.helperId)
      .eq('verified', true)
      .maybeSingle();
    if (helperError) return jsonError('Unable to validate the home-care provider.', 500);
    if (!helper) return jsonError('The selected home-care provider is not approved.', 409);
    if (helper.is_demo) return jsonError('DEMO home-care providers must use the pre-launch demo checkout; no real service will be booked.', 409);
    const { data: offer, error: offerError } = await admin.from('payment_offers')
      .select('id, amount_in_paise, duration_days, included_usage, terms')
      .eq('kind', 'booking')
      .eq('entity_id', helper.id)
      .eq('offer_type', input.offerType)
      .eq('active', true)
      .or(`valid_from.is.null,valid_from.lte.${new Date().toISOString()}`)
      .or(`valid_until.is.null,valid_until.gt.${new Date().toISOString()}`)
      .maybeSingle();
    if (offerError) return jsonError('Unable to load approved home-care pricing.', 500);
    if (!offer || (input.offerType === 'monthly' && !offer.duration_days)) {
      return jsonError('Approved pricing and booking duration are required for this booking option.', 409);
    }
    const start = new Date(`${input.startDate}T00:00:00.000Z`);
    const durationDays = input.offerType === 'daily' ? 1 : offer.duration_days;
    if (start.getTime() < new Date(new Date().toISOString().slice(0, 10)).getTime()) return jsonError('Choose a current or future booking date.', 400);
    const total = Number(offer.amount_in_paise);
    if (!Number.isSafeInteger(total) || total <= 0) return jsonError('Home-care pricing must be configured as a positive amount.', 409);
    amountInPaise = total;
    item = { entityId: helper.id, description: `${helper.service} service - ${input.offerType}`, quantity: 1, unitAmountInPaise: total, terms: { offerId: offer.id, durationDays } };
    orderNotes = { helperId: helper.id, helperName: helper.name, service: helper.service, location: input.location, patientName: input.patientName, startDate: input.startDate, durationDays, offerType: input.offerType, offerId: offer.id };
  }

  if (!amountInPaise || !Number.isSafeInteger(amountInPaise) || amountInPaise <= 0) return jsonError('No valid server-approved amount is available.', 409);

  const existingResult = await admin.from('payment_orders')
    .select('id, provider_order_id, amount_in_paise, currency, kind, status, notes, payment_mode, is_demo, checkout_state, expires_at, updated_at')
    .eq('user_id', user.id)
    .eq('idempotency_key', input.idempotencyKey)
    .maybeSingle();
  if (existingResult.error) return jsonError('Unable to check for a previous checkout attempt.', 500);
  if (existingResult.data) {
    const old = existingResult.data;
    if (
      old.kind !== input.kind
      || old.payment_mode !== flags.mode
      || Number(old.amount_in_paise) !== amountInPaise
      || canonicalJson(old.notes) !== canonicalJson(orderNotes)
    ) return jsonError('Checkout mode or approved terms changed. Start a new checkout to review them.', 409, { restartCheckout: true });
    if (old.status !== 'pending') {
      return jsonError('This checkout is no longer payable. Start a new checkout.', 409, { restartCheckout: true });
    }
    if (old.provider_order_id) {
      if (old.expires_at && new Date(old.expires_at).getTime() <= Date.now()) {
        try {
          const [provider, payments] = await Promise.all([
            fetchRazorpayOrderStatus(old.provider_order_id),
            fetchRazorpayOrderPayments(old.provider_order_id),
          ]);
          if (
            provider.id !== old.provider_order_id
            || provider.amount !== Number(old.amount_in_paise)
            || provider.currency !== old.currency
          ) return jsonError('Provider order does not match the stored checkout. Contact support before retrying.', 409);

          const hasUnresolvedPayment = (payments.items ?? []).some((payment) => (
            payment.status !== 'failed'
            || !payment.id
            || payment.order_id !== old.provider_order_id
          ));
          if ((provider.status === 'created' || provider.status === 'attempted') && !hasUnresolvedPayment) {
            const { data: expired, error: expiryError } = await admin.rpc('expire_stale_provider_payment_order', {
              p_order_id: old.id,
              p_provider_status: provider.status,
              p_has_unresolved_payment: false,
            });
            if (expiryError) return jsonError('Unable to safely release the expired checkout.', 503);
            if (expired) return jsonError('The previous checkout expired without a confirmed payment. Start a new checkout.', 409, { restartCheckout: true });
          }
          return jsonError('The previous checkout needs payment reconciliation. Do not retry until its status is confirmed.', 409, { retrySameCheckout: true });
        } catch {
          return jsonError('Unable to reconcile the previous checkout right now. Retry the same checkout reference later.', 502, { retrySameCheckout: true });
        }
      }
      return NextResponse.json({
        internalOrderId: old.id,
        orderId: old.provider_order_id,
        amount: Number(old.amount_in_paise),
        currency: old.currency,
        key: flags.keyId,
        name: flags.mode === 'live' && isDemoCheckout ? flags.liveMerchantName : 'OncoCare+',
        paymentMode: flags.mode,
        isDemo: Boolean(old.is_demo),
      });
    }
    if (old.checkout_state === 'initializing') {
      const { data: expired, error: expiryError } = await admin.rpc('expire_incomplete_payment_checkout', {
        p_order_id: old.id,
        p_user_id: user.id,
      });
      if (expiryError) return jsonError('Unable to recover the incomplete checkout safely.', 503);
      if (expired) return jsonError('The previous checkout setup expired. Start a new checkout.', 409, { restartCheckout: true });
      return jsonError('Checkout setup is still in progress. Retry this same checkout shortly.', 409, { retrySameCheckout: true });
    }
    try {
      const { data: claimed, error: claimError } = await admin.rpc('claim_payment_provider_order', {
        p_order_id: old.id,
        p_user_id: user.id,
      });
      if (claimError) return jsonError('Payment recovery is temporarily unavailable.', 503);
      if (!claimed) return jsonError('Another request is recovering this checkout. Retry the same checkout shortly.', 409, { retrySameCheckout: true });
      const providerOrderId = await ensureLinkedRazorpayOrder(admin, {
        id: old.id,
        userId: user.id,
        kind: input.kind,
        amountInPaise,
      });
      return NextResponse.json({
        internalOrderId: old.id,
        orderId: providerOrderId,
        amount: amountInPaise,
        currency: 'INR',
        key: flags.keyId,
        name: flags.mode === 'live' && isDemoCheckout ? flags.liveMerchantName : 'OncoCare+',
        paymentMode: flags.mode,
        isDemo: isDemoCheckout,
      });
    } catch {
      return jsonError('Payment recovery is temporarily unavailable. Retry with the same checkout reference.', 503);
    }
  }

  const { data: order, error: orderError } = await admin.from('payment_orders').insert({
    user_id: user.id,
    kind: input.kind,
    status: 'pending',
    checkout_state: 'initializing',
    amount_in_paise: amountInPaise,
    currency: 'INR',
    payment_mode: flags.mode,
    is_demo: isDemoCheckout,
    live_demo_consent_at: flags.mode === 'live' && input.liveDemoConsent === true ? new Date().toISOString() : null,
    notes: orderNotes,
    idempotency_key: input.idempotencyKey,
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  }).select('id').single();
  if (orderError || !order) {
    const { data: concurrentOrder, error: concurrentError } = await admin.from('payment_orders')
      .select('id, kind, amount_in_paise, notes')
      .eq('user_id', user.id)
      .eq('idempotency_key', input.idempotencyKey)
      .maybeSingle();
    if (!concurrentError && concurrentOrder
      && concurrentOrder.kind === input.kind
      && Number(concurrentOrder.amount_in_paise) === amountInPaise
      && canonicalJson(concurrentOrder.notes) === canonicalJson(orderNotes)) {
      return jsonError('Checkout initialization is already in progress. Retry the same checkout shortly.', 409, { retrySameCheckout: true });
    }
    return jsonError('Unable to create the payment record.', 500);
  }

  const { error: auditError } = await admin.from('payment_audit_log').insert({
    actor_user_id: user.id,
    action: 'payment.checkout_created',
    order_id: order.id,
    details: { kind: input.kind, amount_in_paise: amountInPaise, payment_mode: flags.mode, is_demo: isDemoCheckout },
  });
  if (auditError) {
    const { error: failError } = await admin.from('payment_orders').update({
      status: 'failed',
      checkout_state: 'failed',
      failure_reason: 'Checkout audit record could not be saved',
      updated_at: new Date().toISOString(),
    }).eq('id', order.id);
    return jsonError(failError ? 'Checkout audit failed and payment setup requires support review.' : 'Unable to record the checkout audit entry.', 503, { restartCheckout: !failError });
  }

  if (item) {
    const { error: itemError } = await admin.from('payment_order_items').insert({
      order_id: order.id,
      entity_id: item.entityId,
      seller_id: item.sellerId ?? null,
      description: item.description,
      quantity: item.quantity,
      unit_amount_in_paise: item.unitAmountInPaise,
      total_amount_in_paise: amountInPaise,
      terms: item.terms ?? {},
    });
    if (itemError) {
      const { error: failError } = await admin.from('payment_orders').update({
        status: 'failed', checkout_state: 'failed', failure_reason: 'Could not save order details', updated_at: new Date().toISOString(),
      }).eq('id', order.id);
      return jsonError(failError ? 'Payment order setup failed and requires support review.' : 'Unable to save the payment order details.', failError ? 503 : 500, { restartCheckout: !failError });
    }
  }

  if (isDemoCheckout) {
    const { error: demoBookingError } = await admin.from('prelaunch_demo_bookings').insert({
      payment_order_id: order.id,
      catalog_id: demoCatalog?.id ?? null,
      patient_id: user.id,
      kind: input.kind,
      provider_label: demoCatalog?.provider_label ?? 'DEMO: Simulated Campaign',
      service_name: demoCatalog?.service_name ?? 'DEMO: Simulated contribution - no beneficiary',
      requested_date: input.bookingDate ?? null,
      requested_start_time: input.startTime ?? null,
      requested_end_time: input.endTime ?? null,
      amount_in_paise: amountInPaise,
      payment_mode: flags.mode,
      disclosure_version: 'prelaunch-demo-v1',
    });
    if (demoBookingError) {
      const { error: failError } = await admin.from('payment_orders').update({
        status: 'failed', checkout_state: 'failed', failure_reason: 'Demo record creation failed', updated_at: new Date().toISOString(),
      }).eq('id', order.id);
      const duplicateSlot = demoBookingError.code === '23505';
      return jsonError(
        failError ? 'Demo checkout setup failed and requires support review.' : duplicateSlot ? 'That demo time slot is already reserved. Choose another time.' : 'Unable to save the demo booking record.',
        failError ? 503 : duplicateSlot ? 409 : 500,
        { restartCheckout: !failError },
      );
    }
    if (input.kind === 'donation') {
      const { error: donationError } = await admin.from('payment_donations').insert({
        order_id: order.id,
        case_id: null,
        purpose: 'PRELAUNCH_SIMULATION_NO_BENEFICIARY_NO_CHARITABLE_CONTRIBUTION',
      });
      if (donationError) {
        const { error: failError } = await admin.from('payment_orders').update({
          status: 'failed', checkout_state: 'failed', failure_reason: 'Simulated donation ledger creation failed', updated_at: new Date().toISOString(),
        }).eq('id', order.id);
        return jsonError(failError ? 'Simulated donation setup requires support review.' : 'Unable to record the simulated donation transaction.', failError ? 503 : 500, { restartCheckout: !failError });
      }
    }
  } else if (input.kind === 'donation') {
    const { error: donationError } = await admin.from('payment_donations').insert({
      order_id: order.id,
      case_id: null,
      bpl_patient_id: input.bplPatientId,
      donor_name: input.donorName,
      donor_email: input.donorEmail,
      payment_method: 'razorpay',
      purpose: String(orderNotes.donationPurpose),
    });
    if (donationError) {
      const { error: failError } = await admin.from('payment_orders').update({
        status: 'failed',
        checkout_state: 'failed',
        failure_reason: 'BPL donation campaign record creation failed',
        updated_at: new Date().toISOString(),
      }).eq('id', order.id);
      return jsonError(
        failError ? 'Donation setup failed and requires support review.' : 'Unable to save the donation campaign record.',
        failError ? 503 : 500,
        { restartCheckout: !failError },
      );
    }
  }

  if (stockProductId) {
    const { error: reserveError } = await admin.rpc('reserve_payment_order_stock', {
      p_order_id: order.id,
      p_product_id: stockProductId,
      p_quantity: input.quantity,
    });
    if (reserveError) {
      const { error: failError } = await admin.from('payment_orders').update({
        status: 'failed', checkout_state: 'failed', failure_reason: 'Stock reservation failed', updated_at: new Date().toISOString(),
      }).eq('id', order.id);
      return jsonError(failError ? 'Stock reservation failed and checkout recovery requires support.' : 'Stock changed during checkout. Refresh and try again.', failError ? 503 : 409, { restartCheckout: !failError });
    }
  }

  if (!isDemoCheckout && input.kind === 'insurance') {
    const { error: appError } = await admin.from('insurance_payment_applications').insert({
      order_id: order.id, user_id: user.id, plan_id: input.insurancePlanId, issuance_status: 'payment_pending',
    });
    if (appError) {
      const { error: failError } = await admin.from('payment_orders').update({
        status: 'failed', checkout_state: 'failed', failure_reason: 'Insurance application creation failed', updated_at: new Date().toISOString(),
      }).eq('id', order.id);
      return jsonError(failError ? 'Insurance application setup failed and requires support review.' : 'Unable to create the pending insurance application.', failError ? 503 : 500, { restartCheckout: !failError });
    }
  }

  if (!isDemoCheckout && input.kind === 'booking') {
    const durationDays = Number(orderNotes.durationDays);
    const { error: bookingError } = await admin.rpc('create_payment_homecare_booking', {
      p_order_id: order.id,
      p_user_id: user.id,
      p_helper_id: String(orderNotes.helperId),
      p_patient_name: String(orderNotes.patientName),
      p_location: String(orderNotes.location),
      p_start_date: String(orderNotes.startDate),
      p_duration_days: durationDays,
      p_amount_in_paise: amountInPaise,
      p_notes: input.reason ?? '',
    });
    if (bookingError) {
      const { error: failError } = await admin.from('payment_orders').update({
        status: 'failed', checkout_state: 'failed', failure_reason: 'Booking creation failed', updated_at: new Date().toISOString(),
      }).eq('id', order.id);
      return jsonError(failError ? 'Booking reservation failed and checkout recovery requires support.' : 'Unable to reserve the booking. Please try another date.', failError ? 503 : 409, { restartCheckout: !failError });
    }
  }

  if (!isDemoCheckout && input.kind === 'caregiver') {
    const { error: caregiverBookingError } = await admin.from('caregiver_payment_bookings').insert({
      payment_order_id: order.id,
      patient_id: user.id,
      caregiver_id: String(orderNotes.caregiverId),
      service_id: String(orderNotes.serviceId),
      requested_date: String(orderNotes.bookingDate),
      requested_start_time: String(orderNotes.startTime),
      requested_end_time: String(orderNotes.endTime),
      location: String(orderNotes.location),
      requirements: String(orderNotes.requirements),
      amount_in_paise: amountInPaise,
      status: 'payment_pending',
    });
    if (caregiverBookingError) {
      const { error: failError } = await admin.from('payment_orders').update({
        status: 'failed',
        checkout_state: 'failed',
        failure_reason: 'Caregiver booking reservation failed',
        updated_at: new Date().toISOString(),
      }).eq('id', order.id);
      return jsonError(
        failError ? 'Caregiver booking setup failed and requires support review.' : 'The caregiver booking could not be reserved. Review availability and try again.',
        failError ? 503 : 409,
        { restartCheckout: !failError },
      );
    }
  }

  if (!isDemoCheckout && input.kind === 'tele-oncology' && teleAppointmentDate) {
    const { error: appointmentError } = await admin.rpc('create_payment_tele_appointment', {
      p_order_id: order.id,
      p_user_id: user.id,
      p_doctor_id: input.doctorId ?? '',
      p_doctor_name: input.doctorName ?? 'Tele-oncology provider',
      p_appointment_date: teleAppointmentDate,
      p_reason: String(orderNotes.reason),
      p_notes: String(orderNotes.appointmentNotes),
    });
    if (appointmentError) {
      const { error: failError } = await admin.from('payment_orders').update({
        status: 'failed', checkout_state: 'failed', failure_reason: 'Consultation slot reservation failed', updated_at: new Date().toISOString(),
      }).eq('id', order.id);
      return jsonError(failError ? 'Consultation slot setup failed and requires support review.' : 'The selected consultation slot could not be reserved. Choose another slot.', failError ? 503 : 409, { restartCheckout: !failError });
    }
  }

  const { error: readyError } = await admin.from('payment_orders')
    .update({ checkout_state: 'ready', updated_at: new Date().toISOString() })
    .eq('id', order.id)
    .eq('status', 'pending');
  if (readyError) return jsonError('Checkout setup is incomplete and is being held for safe recovery.', 503);

  const { data: claimed, error: claimError } = await admin.rpc('claim_payment_provider_order', {
    p_order_id: order.id,
    p_user_id: user.id,
  });
  if (claimError) return jsonError('Unable to claim this checkout for provider order creation.', 503);
  if (!claimed) return jsonError('Another request is creating the provider order. Retry the same checkout shortly.', 409, { retrySameCheckout: true });

  try {
    const providerOrderId = await ensureLinkedRazorpayOrder(admin, {
      id: order.id,
      userId: user.id,
      kind: input.kind,
      amountInPaise,
    });
    return NextResponse.json({
      internalOrderId: order.id,
      orderId: providerOrderId,
      amount: amountInPaise,
      currency: 'INR',
      key: flags.keyId,
      name: flags.mode === 'live' && isDemoCheckout ? flags.liveMerchantName : 'OncoCare+',
      paymentMode: flags.mode,
      isDemo: isDemoCheckout,
      receipt: order.id,
    });
  } catch {
    console.error('Razorpay order creation or linking is uncertain; retry the same checkout after the recovery window.');
    return jsonError('The payment provider response is uncertain. Retry this same checkout to recover it safely.', 502);
  }
}
