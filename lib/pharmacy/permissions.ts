export type PharmacyCapability =
  | 'orders.read'
  | 'orders.create'
  | 'orders.progress'
  | 'prescriptions.read'
  | 'prescriptions.verify'
  | 'inventory.read'
  | 'inventory.write'
  | 'inventory.receive'
  | 'inventory.adjust'
  | 'catalogue.manage'
  | 'pricing.manage'
  | 'payments.record'
  | 'payments.refund'
  | 'deliveries.manage'
  | 'customers.read'
  | 'customers.write'
  | 'reports.read'
  | 'settings.manage'
  | 'staff.manage';

const ROLE_CAPABILITIES: Record<string, PharmacyCapability[]> = {
  pharmacy_admin: [
    'orders.read', 'orders.create', 'orders.progress', 'prescriptions.read', 'prescriptions.verify',
    'inventory.read', 'inventory.write', 'inventory.receive', 'inventory.adjust', 'catalogue.manage',
    'pricing.manage', 'payments.record', 'payments.refund', 'deliveries.manage', 'customers.read',
    'customers.write', 'reports.read', 'settings.manage', 'staff.manage',
  ],
  pharmacist: [
    'orders.read', 'orders.create', 'orders.progress', 'prescriptions.read', 'prescriptions.verify',
    'inventory.read', 'inventory.write', 'inventory.receive', 'inventory.adjust', 'catalogue.manage',
    'pricing.manage', 'payments.record', 'payments.refund', 'deliveries.manage', 'customers.read',
    'customers.write',
  ],
  store_staff: [
    'orders.read', 'orders.create', 'orders.progress', 'prescriptions.read', 'inventory.read',
    'inventory.receive', 'payments.record', 'deliveries.manage', 'customers.read', 'customers.write',
  ],
  delivery_staff: ['deliveries.manage'],
};

export function pharmacyRoleCan(role: string, capability: PharmacyCapability): boolean {
  return ROLE_CAPABILITIES[role]?.includes(capability) ?? false;
}

export function pharmacyRolesCan(roles: string[], capability: PharmacyCapability): boolean {
  return roles.some((role) => pharmacyRoleCan(role, capability));
}
