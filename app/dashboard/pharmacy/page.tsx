'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Pill, Package, TrendingUp, AlertTriangle, Search, Edit2,
  Check, X, ArrowRight, DollarSign, Boxes, ShieldCheck,
} from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { DashboardLayout, type NavItem } from '@/components/auth/dashboard-layout';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase-client';
import { availabilityConfig, formatINR, type Availability } from '@/lib/medicine-types';
import { cn } from '@/lib/utils';

const pharmacyNavItems: NavItem[] = [
  { label: 'Overview', href: '/dashboard/pharmacy', icon: TrendingUp },
  { label: 'Inventory', href: '/dashboard/pharmacy', icon: Package },
  { label: 'Medicine Finder', href: '/medicine-finder', icon: Pill },
  { label: 'Admin Panel', href: '/admin', icon: ShieldCheck },
  { label: 'Profile', href: '/dashboard/profile', icon: Pill },
  { label: 'Settings', href: '/dashboard/settings', icon: ShieldCheck },
];

function PharmacyDashboardContent() {
  const { user } = useAuth();
  const [pharmacyId, setPharmacyId] = useState<string | null>(null);
  const [medicines, setMedicines] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [editDiscount, setEditDiscount] = useState('');
  const [editAvailability, setEditAvailability] = useState<Availability>('in_stock');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadPharmacy();
  }, [user]);

  const loadPharmacy = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: pharmacy } = await supabase
        .from('pharmacies')
        .select('id')
        .or(`name.ilike.%${user.profile?.full_name || user.email}%`)
        .limit(1)
        .maybeSingle();

      if (pharmacy) {
        setPharmacyId(pharmacy.id);
        await loadMedicines(pharmacy.id);
      } else {
        const { data: allPharmacies } = await supabase.from('pharmacies').select('id').limit(1).maybeSingle();
        if (allPharmacies) {
          setPharmacyId(allPharmacies.id);
          await loadMedicines(allPharmacies.id);
        }
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  const loadMedicines = async (phId: string) => {
    const { data } = await supabase
      .from('medicine_prices')
      .select(`*, medicine:medicines(*)`)
      .eq('pharmacy_id', phId)
      .order('current_price', { ascending: true });
    setMedicines(data || []);
  };

  const handleEdit = (med: any) => {
    setEditingId(med.id);
    setEditPrice(med.current_price.toString());
    setEditDiscount(med.discount_percent.toString());
    setEditAvailability(med.availability);
  };

  const handleSave = async (medId: string) => {
    setSaving(true);
    try {
      await supabase.from('medicine_prices').update({
        current_price: parseFloat(editPrice) || 0,
        discount_percent: parseFloat(editDiscount) || 0,
        availability: editAvailability,
        updated_at: new Date().toISOString(),
      }).eq('id', medId);
      if (pharmacyId) await loadMedicines(pharmacyId);
      setEditingId(null);
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  };

  const filteredMedicines = medicines.filter((m) =>
    m.medicine?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.medicine?.generic_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const inStock = medicines.filter((m) => m.availability === 'in_stock').length;
  const lowStock = medicines.filter((m) => m.availability === 'low_stock').length;
  const outOfStock = medicines.filter((m) => m.availability === 'out_of_stock').length;
  const totalValue = medicines.reduce((sum, m) => sum + m.current_price, 0);

  const statCards = [
    { label: 'Total Medicines', value: medicines.length, icon: Package, color: 'from-teal-500 to-emerald-500' },
    { label: 'In Stock', value: inStock, icon: Boxes, color: 'from-emerald-500 to-teal-500' },
    { label: 'Low Stock Alerts', value: lowStock, icon: AlertTriangle, color: 'from-amber-500 to-orange-500' },
    { label: 'Inventory Value', value: formatINR(totalValue), icon: DollarSign, color: 'from-blue-500 to-indigo-500' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Pharmacy Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Manage your medicine inventory, prices, and availability</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm"
          >
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${stat.color} text-white shadow-md`}>
              <stat.icon className="h-5 w-5" />
            </div>
            <div className="mt-3 text-2xl font-bold text-slate-900">{loading ? '—' : stat.value}</div>
            <div className="text-xs text-slate-500">{stat.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Inventory table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Inventory Management</h2>
            <p className="text-xs text-slate-500">Update prices, stock levels, and discounts in real-time</p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search medicines..."
              className="rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm focus:border-teal-300 focus:outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3">Medicine</th>
                <th className="px-5 py-3">Price</th>
                <th className="px-5 py-3">Discount</th>
                <th className="px-5 py-3">Availability</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [1, 2, 3, 4, 5].map((i) => (
                  <tr key={i} className="border-b border-slate-50">
                    <td colSpan={5} className="px-5 py-4"><div className="h-8 animate-pulse rounded bg-slate-50" /></td>
                  </tr>
                ))
              ) : filteredMedicines.length > 0 ? (
                filteredMedicines.map((med) => (
                  <tr key={med.id} className="border-b border-slate-50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Pill className="h-4 w-4 text-teal-500" />
                        <div>
                          <div className="text-sm font-semibold text-slate-800">{med.medicine?.name}</div>
                          <div className="text-[10px] text-slate-400">{med.medicine?.generic_name} · {med.medicine?.strength}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      {editingId === med.id ? (
                        <input
                          type="number"
                          value={editPrice}
                          onChange={(e) => setEditPrice(e.target.value)}
                          className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm focus:border-teal-300 focus:outline-none"
                        />
                      ) : (
                        <span className="text-sm font-bold text-slate-900">{formatINR(med.current_price)}</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {editingId === med.id ? (
                        <input
                          type="number"
                          value={editDiscount}
                          onChange={(e) => setEditDiscount(e.target.value)}
                          className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-sm focus:border-teal-300 focus:outline-none"
                        />
                      ) : (
                        <span className="text-sm text-slate-600">{med.discount_percent}%</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {editingId === med.id ? (
                        <select
                          value={editAvailability}
                          onChange={(e) => setEditAvailability(e.target.value as Availability)}
                          className="rounded-lg border border-slate-200 px-2 py-1 text-sm focus:border-teal-300 focus:outline-none"
                        >
                          <option value="in_stock">In Stock</option>
                          <option value="low_stock">Low Stock</option>
                          <option value="out_of_stock">Out of Stock</option>
                        </select>
                      ) : (
                        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold', availabilityConfig[med.availability as Availability].color, availabilityConfig[med.availability as Availability].bg)}>
                          <span className={cn('h-1.5 w-1.5 rounded-full', availabilityConfig[med.availability as Availability].dot)} />
                          {availabilityConfig[med.availability as Availability].label}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {editingId === med.id ? (
                        <div className="flex justify-end gap-1">
                          <button onClick={() => handleSave(med.id)} disabled={saving} className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 hover:bg-emerald-200 disabled:opacity-50">
                            {saving ? <div className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-300 border-t-emerald-600" /> : <Check className="h-4 w-4" />}
                          </button>
                          <button onClick={() => setEditingId(null)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => handleEdit(med)} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-teal-100 hover:text-teal-700">
                          <Edit2 className="h-3 w-3" />
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center">
                    <Package className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="mt-2 text-sm text-slate-400">No medicines found</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Medicine Finder', desc: 'Compare prices across pharmacies', icon: Pill, href: '/medicine-finder' },
          { label: 'Admin Panel', desc: 'Full inventory management', icon: ShieldCheck, href: '/admin' },
          { label: 'Partner Portal', desc: 'Register as a pharmacy partner', icon: Package, href: '/partner-portal' },
          { label: 'Profile', desc: 'Update pharmacy details', icon: TrendingUp, href: '/dashboard/profile' },
        ].map((action) => (
          <a key={action.label} href={action.href} className="group flex flex-col gap-2 rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm transition-all hover:border-teal-200 hover:shadow-md">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
              <action.icon className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">{action.label}</div>
              <div className="text-xs text-slate-500">{action.desc}</div>
            </div>
            <ArrowRight className="h-3.5 w-3.5 text-slate-300 transition-colors group-hover:text-teal-500" />
          </a>
        ))}
      </div>
    </div>
  );
}

export default function PharmacyDashboardPage() {
  return (
    <ProtectedRoute allowedRoles={['pharmacy']}>
      <DashboardLayout navItems={pharmacyNavItems} dashboardTitle="Pharmacy Portal">
        <PharmacyDashboardContent />
      </DashboardLayout>
    </ProtectedRoute>
  );
}
