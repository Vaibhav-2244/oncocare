'use client';

import { HospitalRouteError } from '@/components/hospital/HospitalRouteError';

export default function PatientRecordError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <HospitalRouteError {...props} />;
}
