import { HospitalPatientRecordPage } from '@/components/hospital/HospitalPatientRecordPage';

export default function HospitalPatientRecordRoute({ params }: { params: { identifier: string } }) {
  return <HospitalPatientRecordPage identifier={params.identifier} />;
}
