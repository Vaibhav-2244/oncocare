'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Box, CalendarClock, Download, PackageCheck, PackageOpen, Plus, TrendingDown, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { usePharmacy } from '@/lib/pharmacy/PharmacyProvider';
import { getErrorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase-client';

type StockStatus = 'Healthy' | 'Low' | 'Critical' | 'Out' | 'Expiring' | 'Expired';

interface InventoryProduct {
  id: string;
  name: string;
  form: string | null;
  strength: string | null;
  schedule: string | null;
  mrp: number | null;
  selling_price: number | null;
  reorder_level: number | null;
  is_active: boolean;
  available: number;
  reserved: number;
  nearest_expiry: string | null;
  expiry_days: number | null;
}

interface RawInventoryProduct {
  id: string;
  name: string;
  form: string | null;
  strength: string | null;
  schedule: string | null;
  mrp: number | null;
  selling_price: number | null;
  reorder_level: number | null;
  is_active: boolean;
  medicine_id: string | null;
}

interface BatchRow {
  id: string;
  product_id: string;
  batch_no: string;
  expiry_date: string;
  qty_on_hand: number;
  qty_reserved: number;
  status: string;
}

function getStatus(product: InventoryProduct): StockStatus {
  if (product.available <= 0) return 'Out';
  if (product.expiry_days !== null && product.expiry_days <= 30) return 'Expiring';
  if (product.nearest_expiry && new Date(product.nearest_expiry).getTime() < Date.now()) return 'Expired';
  if (product.available <= (product.reorder_level ?? 0)) return 'Low';
  if (product.available <= (product.reorder_level ?? 0) * 2) return 'Critical';
  return 'Healthy';
}

const statusColors: Record<StockStatus, string> = {
  Healthy: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  Low: 'bg-amber-50 text-amber-800 border-amber-200',
  Critical: 'bg-orange-50 text-orange-800 border-orange-200',
  Out: 'bg-rose-50 text-rose-800 border-rose-200',
  Expiring: 'bg-violet-50 text-violet-800 border-violet-200',
  Expired: 'bg-slate-800 text-white border-slate-800',
};

export function PharmacyInventoryPage() {
  const t = useTranslations('pharmacyApp.inventory');
  const { org } = usePharmacy();
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [batches, setBatches] = useState<Record<string, BatchRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<InventoryProduct | null>(null);
  const [form, setForm] = useState({ batch_no: '', expiry_date: '', qty: '0', supplier_name: '', reason: '', adjustment: '0' });
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    if (!org) return;
    setLoading(true);
    setError(null);
    try {
      const [productsRes, batchesRes] = await Promise.all([
        supabase
          .from('pharmacy_products')
          .select('id, name, form, strength, schedule, mrp, selling_price, reorder_level, is_active, medicine_id')
          .eq('pharmacy_id', org.id)
          .order('name', { ascending: true }),
        supabase
          .from('pharmacy_stock_batches')
          .select('id, product_id, batch_no, expiry_date, qty_on_hand, qty_reserved, status')
          .eq('pharmacy_id', org.id)
          .order('expiry_date', { ascending: true }),
      ]);
      if (productsRes.error) throw productsRes.error;
      if (batchesRes.error) throw batchesRes.error;

      const productList = (productsRes.data ?? []) as RawInventoryProduct[];
      const stockMap = new Map<string, BatchRow[]>();
      for (const batch of (batchesRes.data ?? []) as BatchRow[]) {
        const list = stockMap.get(batch.product_id) ?? [];
        list.push(batch);
        stockMap.set(batch.product_id, list);
      }

      const enriched = productList.map((product) => {
        const rows = stockMap.get(product.id) ?? [];
        const activeRows = rows.filter((row) => row.status === 'active');
        const available = activeRows.reduce((total, row) => total + Math.max(0, row.qty_on_hand - row.qty_reserved), 0);
        const reserved = activeRows.reduce((total, row) => total + row.qty_reserved, 0);
        const nearest = activeRows.length ? activeRows.reduce((min, row) => {
          const candidate = new Date(row.expiry_date).getTime();
          return candidate < min ? candidate : min;
        }, Number.MAX_SAFE_INTEGER) : null;

        const expiryDays = nearest && nearest !== Number.MAX_SAFE_INTEGER
          ? Math.ceil((new Date(nearest).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          : null;

        return {
          ...product,
          available,
          reserved,
          nearest_expiry: nearest ? new Date(nearest).toISOString() : null,
          expiry_days: expiryDays,
        };
      });

      setProducts(enriched);
      setBatches(Object.fromEntries(stockMap.entries()));
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
    } finally {
      setLoading(false);
    }
  }, [org]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const summary = useMemo(() => ({
    total: products.length,
    low: products.filter((product) => getStatus(product) === 'Low' || getStatus(product) === 'Critical').length,
    expiring: products.filter((product) => product.expiry_days !== null && product.expiry_days <= 30).length,
    available: products.reduce((total, product) => total + product.available, 0),
  }), [products]);

  const handleSubmit = async () => {
    if (!selectedProduct || !org) return;
    setSubmitting(true);
    try {
      const payload = { batch_no: form.batch_no, expiry_date: form.expiry_date, qty: Number(form.qty), purchase_price: 0, supplier_name: form.supplier_name || null };
      const { error } = await supabase.rpc('receive_stock', {
        p_org_id: org.id,
        p_product_id: selectedProduct.id,
        p_batch_no: payload.batch_no,
        p_expiry_date: payload.expiry_date,
        p_qty: payload.qty,
        p_purchase_price: 0,
        p_supplier_name: payload.supplier_name,
      });
      if (error) throw error;
      setSelectedProduct(null);
      setForm({ batch_no: '', expiry_date: '', qty: '0', supplier_name: '', reason: '', adjustment: '0' });
      await refresh();
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdjust = async () => {
    if (!selectedProduct || !org) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc('adjust_stock', {
        p_org_id: org.id,
        p_product_id: selectedProduct.id,
        p_batch_id: (batches[selectedProduct.id] ?? [])[0]?.id ?? null,
        p_qty_delta: Number(form.adjustment),
        p_reason: form.reason || 'stock_adjustment',
      });
      if (error) throw error;
      setSelectedProduct(null);
      setForm({ batch_no: '', expiry_date: '', qty: '0', supplier_name: '', reason: '', adjustment: '0' });
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
        <Button className="gap-2"> <Plus className="h-4 w-4" /> {t('receive')} </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-600">{t('kpis.total')}</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-slate-950">{summary.total}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-600">{t('kpis.low')}</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-amber-700">{summary.low}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-600">{t('kpis.expiring')}</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-violet-700">{summary.expiring}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-600">{t('kpis.available')}</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-emerald-700">{summary.available}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-base font-semibold text-slate-900">{t('tableTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('columns.product')}</TableHead>
                <TableHead>{t('columns.stock')}</TableHead>
                <TableHead>{t('columns.expiry')}</TableHead>
                <TableHead>{t('columns.status')}</TableHead>
                <TableHead>{t('columns.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-slate-500">{t('empty')}</TableCell>
                </TableRow>
              ) : (
                products.map((product) => {
                  const status = getStatus(product);
                  return (
                    <TableRow key={product.id} className="align-top">
                      <TableCell>
                        <div className="font-medium text-slate-900">{product.name}</div>
                        <div className="text-xs text-slate-500">{product.strength ?? '-'} • {product.form ?? 'N/A'} • {product.schedule ?? 'otc'}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium text-slate-900">{product.available}</div>
                        <div className="text-xs text-slate-500">{t('reserved')}: {product.reserved}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-slate-900">{product.nearest_expiry ? new Date(product.nearest_expiry).toLocaleDateString() : '—'}</div>
                        <div className="text-xs text-slate-500">{product.expiry_days !== null ? `${product.expiry_days}d` : '—'}</div>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[status]}>{status}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm" onClick={() => setSelectedProduct(product)}>{t('actions.receive')}</Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader><DialogTitle>{t('dialog.receiveTitle')}</DialogTitle></DialogHeader>
                              <div className="grid gap-4">
                                <div className="grid gap-2"><Label>{t('dialog.batch')}</Label><Input value={form.batch_no} onChange={(event) => setForm((current) => ({ ...current, batch_no: event.target.value }))} /></div>
                                <div className="grid gap-2"><Label>{t('dialog.expiry')}</Label><Input type="date" value={form.expiry_date} onChange={(event) => setForm((current) => ({ ...current, expiry_date: event.target.value }))} /></div>
                                <div className="grid gap-2"><Label>{t('dialog.quantity')}</Label><Input type="number" min="1" value={form.qty} onChange={(event) => setForm((current) => ({ ...current, qty: event.target.value }))} /></div>
                                <div className="grid gap-2"><Label>{t('dialog.supplier')}</Label><Input value={form.supplier_name} onChange={(event) => setForm((current) => ({ ...current, supplier_name: event.target.value }))} /></div>
                              </div>
                              <DialogFooter>
                                <Button variant="outline" onClick={() => setSelectedProduct(null)}>{t('dialog.cancel')}</Button>
                                <Button onClick={() => void handleSubmit()} disabled={submitting}>{submitting ? t('dialog.saving') : t('dialog.save')}</Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>

                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="secondary" size="sm" onClick={() => setSelectedProduct(product)}>{t('actions.adjust')}</Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader><DialogTitle>{t('dialog.adjustTitle')}</DialogTitle></DialogHeader>
                              <div className="grid gap-4">
                                <div className="grid gap-2"><Label>{t('dialog.adjustment')}</Label><Input type="number" value={form.adjustment} onChange={(event) => setForm((current) => ({ ...current, adjustment: event.target.value }))} /></div>
                                <div className="grid gap-2"><Label>{t('dialog.reason')}</Label><Input value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} /></div>
                              </div>
                              <DialogFooter>
                                <Button variant="outline" onClick={() => setSelectedProduct(null)}>{t('dialog.cancel')}</Button>
                                <Button onClick={() => void handleAdjust()} disabled={submitting}>{submitting ? t('dialog.saving') : t('dialog.save')}</Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
