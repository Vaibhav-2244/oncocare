import assert from 'node:assert/strict';
import { getDashboardWorkspaceRole, getNavItemsForRole } from '../lib/dashboard-nav';

const cases: Array<{
  pathname: string;
  roles: Array<'admin' | 'doctor' | 'family_caregiver' | 'hospital' | 'patient' | 'pharmacy' | 'research_partner' | 'super_admin'>;
  expectedRole: ReturnType<typeof getDashboardWorkspaceRole>;
}> = [
  { pathname: '/dashboard/hospital', roles: ['hospital'], expectedRole: 'hospital' },
  { pathname: '/dashboard/hospital/doctors', roles: ['hospital', 'doctor'], expectedRole: 'hospital' },
  { pathname: '/dashboard/hospital/opd', roles: ['doctor'], expectedRole: 'doctor' },
  { pathname: '/dashboard/hospital/opd/session-1', roles: ['doctor'], expectedRole: 'doctor' },
  { pathname: '/dashboard/hospital/doctors', roles: ['doctor'], expectedRole: null },
  { pathname: '/dashboard/doctor/patients', roles: ['hospital', 'doctor'], expectedRole: 'doctor' },
  { pathname: '/dashboard/patient', roles: ['patient', 'doctor'], expectedRole: 'patient' },
  { pathname: '/dashboard/pharmacy/orders', roles: ['pharmacy'], expectedRole: 'pharmacy' },
  { pathname: '/dashboard/caregiver/patients', roles: ['family_caregiver'], expectedRole: 'family_caregiver' },
  { pathname: '/dashboard/research', roles: ['research_partner'], expectedRole: 'research_partner' },
  { pathname: '/dashboard/admin', roles: ['admin', 'super_admin'], expectedRole: 'super_admin' },
];

for (const testCase of cases) {
  assert.equal(
    getDashboardWorkspaceRole(testCase.pathname, testCase.roles),
    testCase.expectedRole,
    `${testCase.pathname} with roles ${testCase.roles.join(', ')}`,
  );
}

assert(
  getNavItemsForRole(getDashboardWorkspaceRole('/dashboard/hospital/opd', ['doctor']))
    .every((item) => item.href.startsWith('/dashboard/doctor') || item.href === '/dashboard/hospital/opd' || item.href === '/dashboard/notifications' || item.href === '/dashboard/profile' || item.href === '/dashboard/settings'),
  'Doctor workspace navigation should not include hospital administration links.',
);

assert(
  getNavItemsForRole(getDashboardWorkspaceRole('/dashboard/hospital/doctors', ['hospital']))
    .every((item) => item.href.startsWith('/dashboard/hospital') || item.href === '/dashboard/notifications' || item.href === '/dashboard/profile'),
  'Hospital workspace navigation should remain within hospital routes and shared account pages.',
);

console.log(`Dashboard navigation checks passed (${cases.length} workspace cases).`);
