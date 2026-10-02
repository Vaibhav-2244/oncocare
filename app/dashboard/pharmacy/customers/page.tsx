'use client';

import { PharmacyCustomerDirectory } from '@/components/pharmacy/PharmacyCustomerDirectory';

export default function PharmacyCustomersPage() {
  return <div className="space-y-5"><div><h2 className="text-2xl font-semibold text-slate-950">Customers</h2><p className="mt-1 text-sm text-slate-600">Manage customer records scoped to this pharmacy.</p></div><PharmacyCustomerDirectory /></div>;
}
