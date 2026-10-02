import { Activity, AlertTriangle, CalendarClock, CheckCircle2, CircleHelp, Clock3, FileCheck2, FlaskConical, LoaderCircle, ShieldAlert, type LucideIcon } from 'lucide-react';

export type StatusPresentation = { label: string; tone: string; icon: LucideIcon };

const tones = {
  green: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  amber: 'border-amber-200 bg-amber-50 text-amber-900',
  red: 'border-rose-200 bg-rose-50 text-rose-800',
  blue: 'border-sky-200 bg-sky-50 text-sky-800',
  slate: 'border-slate-200 bg-slate-50 text-slate-700',
};

const map: Record<string, StatusPresentation> = {
  scheduled: { label: 'Scheduled', tone: tones.blue, icon: CalendarClock },
  confirmed: { label: 'Confirmed', tone: tones.green, icon: CheckCircle2 },
  checked_in: { label: 'Checked in', tone: tones.blue, icon: Activity },
  in_consultation: { label: 'In consultation', tone: tones.amber, icon: Activity },
  completed: { label: 'Completed', tone: tones.green, icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', tone: tones.slate, icon: CircleHelp },
  no_show: { label: 'No show', tone: tones.red, icon: ShieldAlert },
  waiting: { label: 'Waiting', tone: tones.amber, icon: Clock3 },
  called: { label: 'Called', tone: tones.blue, icon: Activity },
  skipped: { label: 'Skipped', tone: tones.slate, icon: CircleHelp },
  referred: { label: 'Referred', tone: tones.blue, icon: FlaskConical },
  draft: { label: 'Draft', tone: tones.slate, icon: FileCheck2 },
  final: { label: 'Final', tone: tones.green, icon: FileCheck2 },
  ordered: { label: 'Ordered', tone: tones.blue, icon: FlaskConical },
  waitlisted: { label: 'Waitlisted', tone: tones.amber, icon: Clock3 },
  offered: { label: 'Slot offered', tone: tones.blue, icon: CalendarClock },
  accepted: { label: 'Accepted', tone: tones.green, icon: CheckCircle2 },
  expired: { label: 'Expired', tone: tones.slate, icon: Clock3 },
  report_ready: { label: 'Report ready', tone: tones.green, icon: FileCheck2 },
  doctor_reviewed: { label: 'Reviewed', tone: tones.green, icon: CheckCircle2 },
  processing: { label: 'Processing', tone: tones.amber, icon: LoaderCircle },
  performed: { label: 'Performed', tone: tones.blue, icon: CheckCircle2 },
  open: { label: 'Open', tone: tones.green, icon: Activity },
  paused: { label: 'Paused', tone: tones.amber, icon: Clock3 },
  closed: { label: 'Closed', tone: tones.slate, icon: CircleHelp },
  available: { label: 'Available', tone: tones.green, icon: CheckCircle2 },
  occupied: { label: 'Occupied', tone: tones.blue, icon: Activity },
  cleaning: { label: 'Cleaning', tone: tones.amber, icon: LoaderCircle },
  blocked: { label: 'Blocked', tone: tones.red, icon: AlertTriangle },
  emergency: { label: 'Emergency', tone: tones.red, icon: ShieldAlert },
  clinically_priority: { label: 'Clinical priority', tone: tones.amber, icon: AlertTriangle },
  urgent: { label: 'Urgent', tone: tones.amber, icon: AlertTriangle },
  routine: { label: 'Routine', tone: tones.slate, icon: CircleHelp },
  pending: { label: 'Pending', tone: tones.amber, icon: Clock3 },
};

export function getStatusPresentation(code: string): StatusPresentation {
  return map[code] ?? { label: code.replaceAll('_', ' '), tone: tones.slate, icon: CircleHelp };
}
