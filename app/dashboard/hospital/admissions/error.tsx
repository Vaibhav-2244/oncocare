'use client';

import { HospitalRouteError } from '@/components/hospital/HospitalRouteError';

export default function AdmissionsError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <HospitalRouteError {...props} />;
}
