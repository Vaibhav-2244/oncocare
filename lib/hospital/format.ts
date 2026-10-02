export function formatHospitalDate(value: string | Date, timezone: string, options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }): string {
  return new Intl.DateTimeFormat(undefined, { ...options, timeZone: timezone }).format(new Date(value));
}

export function formatHospitalTime(value: string | Date, timezone: string): string {
  return formatHospitalDate(value, timezone, { hour: 'numeric', minute: '2-digit' });
}

export function formatRelativeTime(value: string | Date, timezone: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (minutes < 60) return formatter.format(-minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return formatter.format(-hours, 'hour');
  const days = Math.floor(hours / 24);
  return `${formatter.format(-days, 'day')} (${formatHospitalDate(value, timezone)})`;
}

export function maskMobile(value: string | null | undefined): string {
  if (!value) return '—';
  const digits = value.replace(/\D/g, '');
  return `${'X'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

export function formatWaitRange(low: number | null | undefined, high: number | null | undefined, calculating = 'Calculating'): string {
  if (low == null || high == null) return calculating;
  return `${Math.max(0, low)}-${Math.max(low, high)} min`;
}
