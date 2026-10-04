import { z } from 'zod';

export const createHospitalSchema = z.object({
  name: z.string().trim().min(2).max(200),
  timezone: z.string().trim().default('Asia/Kolkata'),
  patientIdLabel: z.string().trim().min(2).max(60).default('NCI Number'),
  patientIdPrefix: z.string().trim().min(2).max(20).default('NCI-'),
});

export type CreateHospitalInput = z.infer<typeof createHospitalSchema>;

export const registerHospitalPatientSchema = z.object({
  identifier: z.string().trim().max(80).optional().or(z.literal('')),
  name: z.string().trim().min(2).max(200),
  mobile: z.string().trim().max(24).optional().or(z.literal('')),
  dob: z.string().optional().or(z.literal('')),
  age: z.coerce.number().int().min(0).max(125).optional(),
  gender: z.string().trim().max(40).optional().or(z.literal('')),
});

export const hospitalAppointmentSchema = z.object({
  patientId: z.string().uuid(),
  doctorId: z.string().uuid(),
  scheduledAt: z.string().datetime(),
  kind: z.enum(['opd', 'follow_up', 'referral']),
  reason: z.string().trim().max(1000).optional(),
});

export const hospitalSessionSchema = z.object({
  doctorId: z.string().uuid(),
  date: z.string().date(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  room: z.string().trim().max(40).optional(),
  consultMinutes: z.coerce.number().int().min(1).max(180).default(10),
}).refine((value) => value.endTime > value.startTime, { path: ['endTime'], message: 'End time must follow start time' });

export const queuePrioritySchema = z.object({
  priority: z.coerce.number().int().min(0).max(3),
  reason: z.string().trim().min(3).max(500),
});
