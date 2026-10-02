'use client';

import { useCallback, useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { usePharmacy } from '@/lib/pharmacy/PharmacyProvider';
import { getErrorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase-client';

interface CustomerRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  total_orders: number | null;
  last_visit_at: string | null;
  customer_type: string | null;
}

export function PharmacyCustomerDirectory() {
  const { org } = usePharmacy();
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!org) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: customerError } = await supabase
        .from('pharmacy_customers')
        .select('*')
        .eq('pharmacy_id', org.id)
        .order('updated_at', { ascending: false });
      if (customerError) throw customerError;
      setCustomers((data ?? []) as CustomerRow[]);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
    } finally {
      setLoading(false);
    }
  }, [org]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) return <div className="text-sm text-slate-600">Loading customers...</div>;
  if (error) return <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{error}</div>;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900"><Users className="h-4 w-4" /> Customer directory</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Orders</TableHead>
              <TableHead>Last visit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-slate-500">No customer records are linked to this pharmacy yet.</TableCell>
              </TableRow>
            ) : (
              customers.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell>
                    <div className="font-medium text-slate-900">{customer.full_name ?? 'Unknown patient'}</div>
                    <div className="text-xs text-slate-500">ID {customer.id.slice(0, 8)}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-slate-700">{customer.phone ?? 'No phone'}</div>
                    <div className="text-xs text-slate-500">{customer.email ?? 'No email'}</div>
                  </TableCell>
                  <TableCell><Badge variant="secondary">{customer.customer_type ?? 'Retail'}</Badge></TableCell>
                  <TableCell>{customer.total_orders ?? 0}</TableCell>
                  <TableCell>{customer.last_visit_at ? new Date(customer.last_visit_at).toLocaleDateString() : '—'}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
