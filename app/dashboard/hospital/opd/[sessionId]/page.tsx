import { HospitalQueueBoard } from '@/components/hospital/HospitalQueueBoard';

export default function HospitalQueueRoute({ params }: { params: { sessionId: string } }) {
  return <HospitalQueueBoard sessionId={params.sessionId} />;
}
