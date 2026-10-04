import Link from "next/link";
import { ArrowLeft, ClipboardCheck } from "lucide-react";

import { Card } from "@/components/ui/Card";
import { InstructionsPanel } from "@/components/instructions/InstructionsPanel";
import { verifyPatientAccess } from "@/features/caregiver/caregiver.service";

interface InstructionsPageProps {
  params: Promise<{
    patientId: string;
  }>;
}

export default async function PatientInstructionsPage({
  params,
}: InstructionsPageProps) {
  const { patientId } = await params;

  const hasAccess = await verifyPatientAccess(patientId);

  if (!hasAccess) {
    return (
      <main className="min-h-screen bg-[#F5F7FA] px-4 py-8">
        <div className="mx-auto max-w-5xl">
          <Card className="p-8 text-center">
            <h1 className="text-lg font-semibold text-gray-900">
              Patient access unavailable
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              You are not authorized to access this patient.
            </p>

            <Link
              href="/dashboard"
              className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-[#0F766E] hover:underline"
            >
              <ArrowLeft size={16} />
              Back to dashboard
            </Link>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F5F7FA] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <Link
            href={`/patients/${patientId}`}
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-[#0F766E]"
          >
            <ArrowLeft size={16} />
            Back to patient
          </Link>

          <div className="mt-5 flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#E8F8F6] text-[#0F766E]">
              <ClipboardCheck size={20} />
            </div>

            <div>
              <h1 className="text-2xl font-semibold text-gray-900">
                Doctor Instructions
              </h1>

              <p className="mt-1 text-sm text-gray-500">
                Instructions shared with you for this patient.
              </p>
            </div>
          </div>
        </div>

        <InstructionsPanel patientId={patientId} />
      </div>
    </main>
  );
}