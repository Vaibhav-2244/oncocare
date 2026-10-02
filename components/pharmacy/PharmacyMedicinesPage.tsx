'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgeCheck, PackageSearch, Pill, Plus, Search, ShieldAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { usePharmacy } from '@/lib/pharmacy/PharmacyProvider';
import { getErrorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase-client';

interface ProductRow {
  id: string;
  name: string;
  generic_name: string | null;
  strength: string | null;
  form: string | null;
  manufacturer: string | null;
  schedule: string | null;
  mrp: number | null;
  selling_price: number | null;
  reorder_level: number | null;
  is_active: boolean;
  requires_prescription: boolean;
}

export function PharmacyMedicinesPage() {
  const t = useTranslations('pharmacyApp.medicines');
  const { org } = usePharmacy();
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: '', generic_name: '', strength: '', form: 'Tablet', mrp: '0', selling_price: '0', schedule: 'otc', reorder_level: '10' });

  const refresh = useCallback(async () => {
    if (!org) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: productsError } = await supabase
        .from('pharmacy_products')
        .select('*')
        .eq('pharmacy_id', org.id)
        .order('name', { ascending: true });
      if (productsError) throw productsError;
      setRows((data ?? []) as ProductRow[]);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
    } finally {
      setLoading(false);
    }
  }, [org]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return rows;
    return rows.filter((row) => `${row.name} ${row.generic_name ?? ''} ${row.strength ?? ''}`.toLowerCase().includes(value));
  }, [query, rows]);

  const onSubmit = async () => {
    if (!org) return;
    setSubmitting(true);
    try {
      const payload = {
        p_org_id: org.id,
        p_name: form.name,
        p_generic_name: form.generic_name,
        p_strength: form.strength,
        p_form: form.form,
        p_manufacturer: 'Custom',
        p_category: 'Custom',
        p_schedule: form.schedule,
        p_requires_prescription: form.schedule !== 'otc',
        p_cold_chain: false,
        p_hsn_code: null,
        p_gst_rate: 0,
        p_mrp: Number(form.mrp),
        p_selling_price: Number(form.selling_price),
        p_reorder_level: Number(form.reorder_level),
        p_is_active: true,
      };
      const { error } = await supabase.rpc('upsert_pharmacy_product', payload);
      if (error) throw error;
      setForm({ name: '', generic_name: '', strength: '', form: 'Tablet', mrp: '0', selling_price: '0', schedule: 'otc', reorder_level: '10' });
      await refresh();
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="text-sm text-slate-600">{t('loading')}</div>;
  if (error) return <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{error}</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">{t('title')}</h2>
          <p className="mt-1 text-sm text-slate-600">{t('description')}</p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> {t('add')}</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader><DialogTitle>{t('dialog.title')}</DialogTitle></DialogHeader>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2 md:col-span-2"><Label>{t('dialog.name')}</Label><Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></div>
              <div className="grid gap-2"><Label>{t('dialog.generic')}</Label><Input value={form.generic_name} onChange={(event) => setForm((current) => ({ ...current, generic_name: event.target.value }))} /></div>
              <div className="grid gap-2"><Label>{t('dialog.strength')}</Label><Input value={form.strength} onChange={(event) => setForm((current) => ({ ...current, strength: event.target.value }))} /></div>
              <div className="grid gap-2"><Label>{t('dialog.form')}</Label><Input value={form.form} onChange={(event) => setForm((current) => ({ ...current, form: event.target.value }))} /></div>
              <div className="grid gap-2"><Label>{t('dialog.schedule')}</Label><Input value={form.schedule} onChange={(event) => setForm((current) => ({ ...current, schedule: event.target.value }))} /></div>
              <div className="grid gap-2"><Label>{t('dialog.mrp')}</Label><Input type="number" min="0" step="0.1" value={form.mrp} onChange={(event) => setForm((current) => ({ ...current, mrp: event.target.value }))} /></div>
              <div className="grid gap-2"><Label>{t('dialog.sellingPrice')}</Label><Input type="number" min="0" step="0.1" value={form.selling_price} onChange={(event) => setForm((current) => ({ ...current, selling_price: event.target.value }))} /></div>
              <div className="grid gap-2"><Label>{t('dialog.reorder')}</Label><Input type="number" min="0" value={form.reorder_level} onChange={(event) => setForm((current) => ({ ...current, reorder_level: event.target.value }))} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline">{t('dialog.cancel')}</Button>
              <Button onClick={() => void onSubmit()} disabled={submitting}>{submitting ? t('dialog.saving') : t('dialog.save')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base font-semibold text-slate-900">{t('catalogue')}</CardTitle>
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder={t('search')} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('columns.medicine')}</TableHead>
                <TableHead>{t('columns.schedule')}</TableHead>
                <TableHead>{t('columns.price')}</TableHead>
                <TableHead>{t('columns.gst')}</TableHead>
                <TableHead>{t('columns.status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-slate-500">{t('empty')}</TableCell>
                </TableRow>
              ) : (
                filtered.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="font-medium text-slate-900">{row.name}</div>
                      <div className="text-xs text-slate-500">{row.generic_name ?? '—'} • {row.strength ?? '—'} • {row.form ?? '—'}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <BadgeCheck className="h-4 w-4 text-emerald-600" />
                        <span className="text-sm uppercase text-slate-700">{row.schedule ?? 'otc'}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium text-slate-900">₹{Number(row.selling_price ?? 0).toFixed(2)}</div>
                      <div className="text-xs text-slate-500">MRP ₹{Number(row.mrp ?? 0).toFixed(2)}</div>
                    </TableCell>
                    <TableCell>{t('gst', { value: row.schedule === 'otc' ? '0%' : '5%' })}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium ${row.is_active ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-100 text-slate-600'}`}>
                        {row.is_active ? t('active') : t('inactive')}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
