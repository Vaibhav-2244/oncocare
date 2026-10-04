export const APP_NAME = "OncoCare+";

export const ROUTES = {
  dashboard: "/dashboard",
  notifications: "/notifications",
  settings: "/settings",
  patient: (patientId: string) => `/patients/${patientId}`,
  medications: (patientId: string) =>
    `/patients/${patientId}/medications`,
  appointments: (patientId: string) =>
    `/patients/${patientId}/appointments`,
  queue: (patientId: string) => `/patients/${patientId}/queue`,
  reports: (patientId: string) => `/patients/${patientId}/reports`,
  timeline: (patientId: string) => `/patients/${patientId}/timeline`,
};

export const STATUS = {
  ACTIVE: "active",
  PENDING: "pending",
  COMPLETED: "completed",
  MISSED: "missed",
  TAKEN: "taken",
  SCHEDULED: "scheduled",
  CANCELLED: "cancelled",
} as const;

export const COLORS = {
  primary: "#2EC4B6",
  primaryDark: "#0F766E",
  background: "#F5F7FA",
  text: "#1F2937",
  muted: "#9CA3AF",
  success: "#22C55E",
  info: "#3B82F6",
  warning: "#F59E0B",
  error: "#EF4444",
} as const;