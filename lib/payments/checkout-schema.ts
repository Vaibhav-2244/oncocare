import { z } from 'zod';

export const checkoutSchema = z.object({
  kind: z.enum(['tele-oncology', 'medicine', 'insurance', 'booking', 'caregiver', 'donation']),
  idempotencyKey: z.string().uuid(),
  demoCatalogId: z.string().uuid().optional(),
  demoDisclosureAccepted: z.boolean().optional(),
  liveDemoConsent: z.boolean().optional(),
  donationAmountInPaise: z.number().int().min(100).max(100000000).optional(),
  bplPatientId: z.number().int().positive().optional(),
  donorName: z.string().trim().min(1).max(255).optional(),
  donorEmail: z.string().trim().email().max(255).optional(),
  plan: z.enum(['one-time', 'monthly']).optional(),
  productId: z.string().uuid().optional(),
  quantity: z.number().int().min(1).max(20).optional(),
  pharmacyId: z.string().uuid().optional(),
  deliveryAddress: z.string().trim().min(10).max(500).optional(),
  prescriptionId: z.string().uuid().optional(),
  insurancePlanId: z.string().uuid().optional(),
  offerType: z.enum(['one-time', 'subscription', 'daily', 'monthly']).optional(),
  helperId: z.string().min(1).max(100).optional(),
  caregiverId: z.string().uuid().optional(),
  serviceId: z.string().uuid().optional(),
  bookingDate: z.string().date().optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  startDate: z.string().date().optional(),
  patientName: z.string().trim().min(1).max(120).optional(),
  location: z.string().trim().min(1).max(240).optional(),
  appointmentDate: z.string().datetime().optional(),
  appointmentTime: z.string().max(40).optional(),
  doctorId: z.string().optional(),
  doctorName: z.string().max(120).optional(),
  patientPhone: z.string().max(30).optional(),
  reason: z.string().max(500).optional(),
}).strict().superRefine((value, context) => {
  const demoCatalogCheckout = Boolean(value.demoCatalogId);
  if (value.kind === 'medicine' && !demoCatalogCheckout) {
    if (!value.productId || !value.pharmacyId || !value.quantity || !value.deliveryAddress) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'A medicine product, pharmacy, quantity, and delivery address are required.' });
    }
    if (value.offerType && value.offerType !== 'one-time') {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Medicine subscriptions are not available.' });
    }
  }
  if (value.kind === 'insurance' && !demoCatalogCheckout && (!value.insurancePlanId || value.offerType !== 'one-time')) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'An insurance plan and supported one-time offer are required.' });
  }
  if (value.kind === 'booking' && !demoCatalogCheckout && (!value.helperId || !value.offerType || !value.startDate || !value.patientName || !value.location)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Provider, offer, start date, patient name, and location are required.' });
  }
  if (value.kind === 'caregiver' && !demoCatalogCheckout && (
    !value.caregiverId || !value.serviceId || !value.bookingDate
    || !value.startTime || !value.endTime || !value.location
  )) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Caregiver, service, date, time, and location are required.' });
  }
  if (value.kind === 'caregiver' && value.startTime && value.endTime && value.startTime >= value.endTime) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'The booking end time must be after its start time.' });
  }
  if (value.kind === 'tele-oncology' && !demoCatalogCheckout && (!value.plan || !value.appointmentDate || !value.appointmentTime || !value.doctorName)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Plan and appointment details are required.' });
  }
  if (value.kind === 'donation' && (!value.donationAmountInPaise
    || (value.bplPatientId === undefined && value.demoDisclosureAccepted !== true)
    || (value.bplPatientId !== undefined && (!value.donorName || !value.donorEmail)))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'A donation amount, verified campaign or demo acknowledgement, and donor details are required.' });
  }
  if (value.kind === 'donation' && value.demoCatalogId && value.bplPatientId !== undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'A campaign donation cannot also be a demo catalogue checkout.' });
  }
  if (value.demoCatalogId && value.demoDisclosureAccepted !== true) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Explicit acknowledgement of the pre-launch demo is required.' });
  }
  if (demoCatalogCheckout && ['caregiver', 'booking', 'tele-oncology'].includes(value.kind)
    && (!value.bookingDate || !value.startTime || !value.endTime || !value.location)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'A demo date, time range, and location are required.' });
  }
  if (value.liveDemoConsent === true && value.demoDisclosureAccepted !== true) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Live demo consent requires acknowledgement of the pre-launch disclosure.' });
  }
});
