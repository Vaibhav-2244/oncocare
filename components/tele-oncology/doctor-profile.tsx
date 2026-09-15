import { X, CheckCircle } from "lucide-react";
import type { Doctor } from "@/lib/data/tele-oncology";
import { Button } from "@/components/ui/button";

interface DoctorProfileProps {
  doctor: Doctor | null;
  onClose: () => void;
  onBook: (doctor: Doctor) => void;
}

export function DoctorProfile({ doctor, onClose, onBook }: DoctorProfileProps) {
  if (!doctor) return null;

  const initials = doctor.name
    .replace("Dr. ", "")
    .split(" ")
    .slice(0, 2)
    .map((word) => word[0])
    .join("");

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-sm">
      <div className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="float-right flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mt-12">
          <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-teal-50 text-3xl font-bold text-teal-600">
            {doctor.image ? (
              <img src={doctor.image} alt={doctor.name} className="h-full w-full rounded-full object-cover" />
            ) : (
              initials
            )}
          </div>

          <h2 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            {doctor.name}
            {doctor.verified && <CheckCircle className="h-5 w-5 text-teal-500" />}
          </h2>
          <p className="mt-1 font-semibold text-teal-700">{doctor.specialty}</p>
          <p className="mt-1 text-slate-600">{doctor.hospital}</p>
        </div>

        <hr className="my-6 border-slate-100" />

        <div className="space-y-4 text-sm text-slate-700">
          <div className="flex justify-between">
            <span className="font-semibold text-slate-900">Experience:</span>
            <span>{doctor.experience}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold text-slate-900">Location:</span>
            <span>{doctor.location}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold text-slate-900">Consultation:</span>
            <span>Video Consultation</span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold text-slate-900">Consultation Fee:</span>
            <span className="font-bold text-teal-700">₹{doctor.consultationFee}</span>
          </div>
        </div>

        <h3 className="mt-8 font-bold text-slate-900">Areas of Expertise</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {doctor.expertise.map((item) => (
            <span
              key={item}
              className="rounded-full bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-700"
            >
              {item}
            </span>
          ))}
        </div>

        <Button
          onClick={() => onBook(doctor)}
          className="mt-8 w-full bg-teal-600 py-6 text-base hover:bg-teal-700 text-white"
        >
          Book Video Consultation
        </Button>
      </div>
    </div>
  );
}
