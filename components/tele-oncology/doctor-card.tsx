import { CheckCircle, Video, MapPin, Clock3, ArrowRight } from "lucide-react";
import type { Doctor } from "@/lib/data/tele-oncology";
import { Button } from "@/components/ui/button";

interface DoctorCardProps {
  doctor: Doctor;
  onView: (doctor: Doctor) => void;
  onBook: (doctor: Doctor) => void;
}

export function DoctorCard({ doctor, onView, onBook }: DoctorCardProps) {
  const initials = doctor.name
    .replace("Dr. ", "")
    .split(" ")
    .slice(0, 2)
    .map((word) => word[0])
    .join("");

  return (
    <div className="flex flex-col rounded-xl border border-slate-200/60 bg-white p-5 shadow-sm transition-colors hover:border-slate-300">
      <div className="flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-teal-50 text-xl font-bold text-teal-600">
          {doctor.image ? (
            <img src={doctor.image} alt={doctor.name} className="h-full w-full rounded-full object-cover" />
          ) : (
            initials
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-bold text-slate-900">{doctor.name}</h3>
            {doctor.verified && <CheckCircle className="h-4 w-4 text-teal-500" />}
          </div>
          <p className="mt-0.5 text-sm font-semibold text-teal-700">{doctor.specialty}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">{doctor.hospital}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-4 text-xs text-slate-600">
        <div className="flex items-center gap-1.5">
          <Clock3 className="h-3.5 w-3.5 text-slate-400" />
          {doctor.experience}
        </div>
        <div className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-slate-400" />
          {doctor.location}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {doctor.expertise.map((item) => (
          <span
            key={item}
            className="rounded-full bg-teal-50 px-2.5 py-1 text-[10px] font-semibold text-teal-700"
          >
            {item}
          </span>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-lg bg-purple-50 p-2.5 text-xs font-medium text-purple-700">
        <Video className="h-4 w-4" />
        Video consultation available
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Consultation Fee</p>
          <p className="text-lg font-bold text-slate-900">₹{doctor.consultationFee}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => onView(doctor)}>
            View Profile
          </Button>
          <Button size="sm" onClick={() => onBook(doctor)} className="gap-1 bg-teal-600 hover:bg-teal-700 text-white">
            Book <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
