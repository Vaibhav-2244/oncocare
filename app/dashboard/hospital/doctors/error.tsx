'use client';

import { HospitalRouteError } from '@/components/hospital/HospitalRouteError';

export default function DoctorsError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <HospitalRouteError {...props} />;
}
