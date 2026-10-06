import {
  Activity,
  AlertCircle,
  Bell,
  BookOpen,
  Brain,
  Calendar,
  ChefHat,
  ClipboardList,
  CreditCard,
  Clock,
  FileText,
  FlaskConical,
  Heart,
  Hospital,
  LayoutDashboard,
  Map,
  MessageCircle,
  MessageSquare,
  Pill,
  Package,
  Settings,
  ShieldCheck,
  Stethoscope,
  Siren,
  TrendingUp,
  Truck,
  User,
  Users,
  Video,
  type LucideIcon,
} from 'lucide-react';
import type { RoleName } from '@/lib/auth-types';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const ALL_ROLES: RoleName[] = [
  'super_admin',
  'admin',
  'patient',
  'family_caregiver',
  'doctor',
  'hospital',
  'pharmacy',
  'medical_advisor',
  'research_partner',
];

export const STAFF_AND_PARTNER_ROLES: RoleName[] = [
  'doctor',
  'hospital',
  'pharmacy',
  'research_partner',
  'admin',
  'super_admin',
];

export const ADMIN_ROLES: RoleName[] = ['super_admin', 'admin'];
export const PATIENT_ROLES: RoleName[] = ['patient', 'family_caregiver', 'medical_advisor'];
export const PATIENT_CAREGIVER_ROLES: RoleName[] = ['patient', 'family_caregiver'];
export const PATIENT_CAREGIVER_ADVISOR_ADMIN_ROLES: RoleName[] = ['patient', 'family_caregiver', 'medical_advisor', 'admin', 'super_admin'];
export const CAREGIVER_ROLES: RoleName[] = ['family_caregiver'];
export const DOCTOR_ROLES: RoleName[] = ['doctor'];
export const HOSPITAL_ROLES: RoleName[] = ['hospital'];
export const PHARMACY_ROLES: RoleName[] = ['pharmacy'];
export const RESEARCH_PARTNER_ROLES: RoleName[] = ['research_partner'];

export const commonNavItems: NavItem[] = [
  { label: 'Overview', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Personalized Nutrition', href: '/dashboard/diet-plan', icon: ChefHat },
  { label: 'BPL Donations', href: '/dashboard/bpl-donations', icon: Heart },
  { label: 'Symptoms', href: '/dashboard/symptoms', icon: AlertCircle },
  { label: 'Treatments', href: '/dashboard/treatments', icon: TrendingUp },
  { label: 'Medications', href: '/dashboard/medications', icon: Pill },
  { label: 'Medicine Finder', href: '/medicine-finder', icon: Pill },
  { label: 'Appointments', href: '/dashboard/appointments', icon: Calendar },
  { label: 'Tele-Oncology', href: '/dashboard/tele-oncology', icon: Video },
  { label: 'Documents', href: '/dashboard/documents', icon: FileText },
  { label: 'Lab Reports', href: '/dashboard/lab-reports', icon: FlaskConical },
  { label: 'Second Opinion', href: '/dashboard/second-opinion', icon: FileText },
  { label: 'Care Team', href: '/dashboard/care-team', icon: Users },
  { label: 'My doctors', href: '/dashboard/my-doctors', icon: Stethoscope },
  { label: 'Caregiver Marketplace', href: '/dashboard/caregiver-marketplace', icon: Users },
  { label: 'Timeline', href: '/dashboard/timeline', icon: Clock },
  { label: 'Community', href: '/dashboard/community', icon: MessageCircle },
  { label: 'Cook & Maid', href: '/dashboard/cook-maid', icon: ChefHat },
  { label: 'Notifications', href: '/dashboard/notifications', icon: Bell },
  { label: 'AI Engine', href: '/dashboard/ai-engine', icon: Brain },
  { label: 'Messages', href: '/dashboard/messages', icon: MessageSquare },
  { label: 'Emergency', href: '/dashboard/emergency', icon: Siren },
  { label: 'Profile', href: '/dashboard/profile', icon: User },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings },
];

export const patientNavItems: NavItem[] = [
  ...commonNavItems,
  { label: 'Caregiver Support', href: '/dashboard/caregiver-support', icon: Heart },
  { label: 'Ayurveda Support', href: '/dashboard/ayurveda-support', icon: Activity },
  { label: 'Nearby Hospitals', href: '/dashboard/nearby-hospitals', icon: Hospital },
  { label: 'Cancer Journey Roadmap', href: '/dashboard/cancer-journey', icon: Map },
  { label: 'Survivor Stories', href: '/dashboard/survivor-stories', icon: BookOpen },
  { label: 'Cancer Insurance', href: '/dashboard/insurance', icon: ShieldCheck },
  { label: 'Government Schemes', href: '/dashboard/insurance/government-schemes', icon: ShieldCheck },
];

export const caregiverNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard/caregiver', icon: LayoutDashboard },
  { label: 'My Patients', href: '/dashboard/caregiver/patients', icon: Users },
  { label: 'Medicine Finder', href: '/medicine-finder', icon: Pill },
  { label: 'Caregiver Support', href: '/dashboard/caregiver-support', icon: Heart },
  { label: 'Ayurveda Support', href: '/dashboard/ayurveda-support', icon: Activity },
  { label: 'Patient Medications', href: '/dashboard/caregiver-medications', icon: Pill },
  { label: 'Notifications', href: '/dashboard/notifications', icon: Bell },
  { label: 'Caregiver Profile', href: '/dashboard/caregiver/settings', icon: User },
  { label: 'Profile', href: '/dashboard/profile', icon: User },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings },
];

export const doctorNavItems: NavItem[] = [
  { label: 'Overview', href: '/dashboard/doctor', icon: LayoutDashboard },
  { label: 'My Patients', href: '/dashboard/doctor/patients', icon: Users },
  { label: 'Appointments', href: '/dashboard/doctor/appointments', icon: Calendar },
  { label: 'Medical Notes', href: '/dashboard/doctor/consultations', icon: FileText },
  { label: 'Prescriptions', href: '/dashboard/doctor/prescriptions', icon: Pill },
  { label: 'Reports', href: '/dashboard/doctor/reports', icon: FlaskConical },
  { label: 'Treatment plans', href: '/dashboard/doctor/treatment-plans', icon: TrendingUp },
  { label: 'Patient links', href: '/dashboard/doctor/links', icon: ShieldCheck },
  { label: 'Messages', href: '/dashboard/doctor/messages', icon: MessageSquare },
  { label: 'Hospital OPD', href: '/dashboard/hospital/opd', icon: Hospital },
  { label: 'Notifications', href: '/dashboard/notifications', icon: Bell },
  { label: 'Profile', href: '/dashboard/profile', icon: User },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings },
];

export const hospitalNavItems: NavItem[] = [
  { label: 'Command Center', href: '/dashboard/hospital', icon: LayoutDashboard },
  { label: 'Patients', href: '/dashboard/hospital/patients', icon: Users },
  { label: 'OPD & Live Queue', href: '/dashboard/hospital/opd', icon: Activity },
  { label: 'Appointments', href: '/dashboard/hospital/appointments', icon: Calendar },
  { label: 'Doctors & Departments', href: '/dashboard/hospital/doctors', icon: Users },
  { label: 'Investigations', href: '/dashboard/hospital/investigations', icon: FlaskConical },
  { label: 'Admissions/Beds', href: '/dashboard/hospital/admissions', icon: Hospital },
  { label: 'Notifications', href: '/dashboard/notifications', icon: Bell },
  { label: 'Hospital Settings', href: '/dashboard/hospital/settings', icon: Settings },
  { label: 'Profile', href: '/dashboard/profile', icon: User },
];

export const researchNavItems: NavItem[] = [
  { label: 'Overview', href: '/dashboard/research', icon: LayoutDashboard },
  { label: 'Medicine Data', href: '/medicine-finder', icon: Pill },
  { label: 'Notifications', href: '/dashboard/notifications', icon: Bell },
  { label: 'Profile', href: '/dashboard/profile', icon: User },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings },
];

export const pharmacyNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard/pharmacy', icon: LayoutDashboard },
  { label: 'Orders', href: '/dashboard/pharmacy/orders', icon: ClipboardList },
  { label: 'Inventory', href: '/dashboard/pharmacy/inventory', icon: Package },
  { label: 'Medicines', href: '/dashboard/pharmacy/medicines', icon: Pill },
  { label: 'Customers', href: '/dashboard/pharmacy/customers', icon: Users },
  { label: 'Prescriptions', href: '/dashboard/pharmacy/prescriptions', icon: FileText },
  { label: 'Deliveries', href: '/dashboard/pharmacy/deliveries', icon: Truck },
  { label: 'Payments', href: '/dashboard/pharmacy/payments', icon: CreditCard },
  { label: 'Notifications', href: '/dashboard/notifications', icon: Bell },
  { label: 'Pharmacy Profile', href: '/dashboard/pharmacy/settings', icon: Settings },
  { label: 'Profile', href: '/dashboard/profile', icon: User },
];

export const adminNavItems: NavItem[] = [
  { label: 'Overview', href: '/dashboard/admin', icon: LayoutDashboard },
  { label: 'Doctor verifications', href: '/dashboard/admin/doctor-verifications', icon: Stethoscope },
  { label: 'User Management', href: '/dashboard/admin#users', icon: Users },
  { label: 'Medicine Finder', href: '/medicine-finder', icon: Pill },
  { label: 'Pharmacy Admin', href: '/admin', icon: ShieldCheck },
  { label: 'Partner Portal', href: '/partner-portal', icon: Hospital },
  { label: 'Notifications', href: '/dashboard/notifications', icon: Bell },
  { label: 'Profile', href: '/dashboard/profile', icon: User },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings },
];

export function getNavItemsForRole(role: RoleName | null): NavItem[] {
  switch (role) {
    case 'family_caregiver':
      return caregiverNavItems;
    case 'doctor':
      return doctorNavItems;
    case 'hospital':
      return hospitalNavItems;
    case 'research_partner':
      return researchNavItems;
    case 'pharmacy':
      return pharmacyNavItems;
    case 'admin':
    case 'super_admin':
      return adminNavItems;
    case 'patient':
    case 'medical_advisor':
    default:
      return patientNavItems;
  }
}

export function getDashboardTitleForRole(role: RoleName | null): string {
  switch (role) {
    case 'family_caregiver':
      return 'Caregiver Dashboard';
    case 'doctor':
      return 'Doctor Portal';
    case 'hospital':
      return 'Hospital Portal';
    case 'research_partner':
      return 'Research Portal';
    case 'pharmacy':
      return 'Pharmacy Portal';
    case 'admin':
    case 'super_admin':
      return 'Admin Panel';
    case 'patient':
    case 'medical_advisor':
    default:
      return 'Patient Dashboard';
  }
}
