export type HospitalCapability =
  | 'patients.read'
  | 'patients.register'
  | 'queue.manage'
  | 'clinical.read'
  | 'clinical.write'
  | 'orders.create'
  | 'orders.pipeline'
  | 'config.manage'
  | 'admissions.manage'
  | 'admissions.read'
  | 'staff.manage';

const ROLE_CAPABILITIES: Record<string, HospitalCapability[]> = {
  hospital_admin: [
    'patients.read', 'patients.register', 'queue.manage', 'clinical.read',
    'orders.pipeline', 'config.manage', 'admissions.manage', 'admissions.read', 'staff.manage',
  ],
  front_desk: ['patients.read', 'patients.register', 'queue.manage'],
  nurse: ['patients.read', 'patients.register', 'queue.manage', 'clinical.read', 'admissions.read'],
  doctor: ['patients.read', 'queue.manage', 'clinical.read', 'clinical.write', 'orders.create', 'admissions.read'],
  admissions_staff: ['patients.read', 'patients.register', 'admissions.manage', 'admissions.read'],
  care_coordinator: ['patients.read', 'patients.register', 'queue.manage'],
  lab_tech: ['patients.read', 'orders.pipeline'],
  radiology_tech: ['patients.read', 'orders.pipeline'],
};

export function hospitalRoleCan(role: string, capability: HospitalCapability): boolean {
  return ROLE_CAPABILITIES[role]?.includes(capability) ?? false;
}

export function hospitalRolesCan(roles: string[], capability: HospitalCapability): boolean {
  return roles.some((role) => hospitalRoleCan(role, capability));
}