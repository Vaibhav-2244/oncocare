import { z } from 'zod';

export const createHospitalSchema = z.object({
  name: z.string().trim().min(2).max(200),
  timezone: z.string().trim().default('Asia/Kolkata'),
  patientIdLabel: z.string().trim().min(2).max(60).default('NCI Number'),
  patientIdPrefix: z.string().trim().min(2).max(20).default('NCI-'),
});

export type CreateHospitalInput = z.infer<typeof createHospitalSchema>;
