'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileText, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { usePharmacy } from '@/lib/pharmacy/PharmacyProvider';
import { getErrorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase-client';

interface PrescriptionRow {
  id: string;
  patient_name: string | null;
  doctor_name: string | null;
  status: string | null;
  created_at: string | null;
  total_items: number | null;
}

export function PharmacyPrescriptionQueue() {
  const { org } = usePharmacy();
  const [rows, setRows] = useState<PrescriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!org) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: prescriptionError } = await supabase
        .from('pharmacy_prescriptions')
        .select('*')
        .eq('pharmacy_id', org.id)
        .order('created_at', { ascending: false });
      if (prescriptionError) throw prescriptionError;
      setRows((data ?? []) as PrescriptionRow[]);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
    } finally {
      setLoading(false);
    }
  }, [org]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) return <div className="text-sm text-slate-600">Loading prescription queue...</div>;
  if (error) return <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{error}</div>;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900"><FileText className="h-4 w-4" /> Prescription queue</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Patient</TableHead>
              <TableHead>Doctor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-slate-500">No prescription entries are awaiting review yet.</TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium text-slate-900">{row.patient_name ?? 'Unknown patient'}</TableCell>
                  <TableCell>{row.doctor_name ?? '—'}</TableCell>
                  <TableCell>
                    <Badge className={row.status === 'verified' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'}>
                      {row.status === 'verified' ? <><ShieldCheck className="mr-1 h-3 w-3" /> Verified</> : row.status ?? 'Pending'}
                    </Badge>
                  </TableCell>
                  <TableCell>{row.total_items ?? 0}</TableCell>
                  <TableCell>{row.created_at ? new Date(row.created_at).toLocaleDateString() : '—'}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
