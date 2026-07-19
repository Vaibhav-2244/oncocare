'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Package, TrendingUp, DollarSign, Search, Edit2, Check, X,
  Pill, Store, BarChart3, Bell, ArrowLeft,
} from 'lucide-react';
import { getAllPharmacies, getPharmacyMedicines, updateMedicinePrice } from '@/lib/medicine-api';
import type { Pharmacy, MedicinePrice, Availability } from '@/lib/medicine-types';
import { availabilityConfig, formatINR } from '@/lib/medicine-types';
import { cn } from '@/lib/utils';

export default function AdminDashboardPage() {
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [selectedPharmacy, setSelectedPharmacy] = useState<Pharmacy | null>(null);
  const [medicines, setMedicines] = useState<MedicinePrice[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [editDiscount, setEditDiscount] = useState('');
  const [editAvailability, setEditAvailability] = useState<Availability>('in_stock');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPharmacies();
  }, []);

  const loadPharmacies = async () => {
    setLoading(true);
    try {
      const pharms = await getAllPharmacies();
      setPharmacies(pharms);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  const loadMedicines = async (pharmacyId: string) => {
    try {
      const meds = await getPharmacyMedicines(pharmacyId);
      setMedicines(meds);
    } catch {
      setMedicines([]);
    }
  };

  const handleSelectPharmacy = (pharmacy: Pharmacy) => {
    setSelectedPharmacy(pharmacy);
    loadMedicines(pharmacy.id);
  };

  const handleEdit = (med: MedicinePrice) => {
    setEditingId(med.id);
    setEditPrice(med.current_price.toString());
    setEditDiscount(med.discount_percent.toString());
    setEditAvailability(med.availability);
  };

  const handleSave = async (medId: string) => {
    try {
      await updateMedicinePrice(
        medId,
        parseFloat(editPrice) || 0,
        parseFloat(editDiscount) || 0,
        editAvailability
      );
      if (selectedPharmacy) {
        await loadMedicines(selectedPharmacy.id);
      }
      setEditingId(null);
    } catch {
      // silently fail
    }
  };

  const filteredMedicines = medicines.filter((m) =>
    m.medicine?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.medicine?.generic_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white pt-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-200 border-t-teal-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-cloud pt-20">
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <a href="/medicine-finder" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-emerald-deep">
              <ArrowLeft className="h-4 w-4" />
              Back to Medicine Finder
            </a>
            <h1 className="mt-2 text-2xl font-bold text-slate-900">Pharmacy Admin Dashboard</h1>
            <p className="text-sm text-slate-500">Manage inventory, prices, and availability</p>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={Store} label="Partner Pharmacies" value={pharmacies.length.toString()} color="from-teal-500 to-emerald-500" />
          <StatCard icon={Package} label="Total Medicines" value={medicines.length.toString()} color="from-blue-500 to-indigo-500" />
          <StatCard icon={TrendingUp} label="In Stock" value={medicines.filter((m) => m.availability === 'in_stock').length.toString()} color="from-emerald-500 to-teal-500" />
          <StatCard icon={Bell} label="Low Stock Alerts" value={medicines.filter((m) => m.availability === 'low_stock').length.toString()} color="from-amber-500 to-orange-500" />
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-12">
          {/* Pharmacy selector */}
          <div className="lg:col-span-3">
            <div className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm">
              <div className="border-b border-slate-100 p-4">
                <h3 className="text-sm font-bold text-slate-900">Select Pharmacy</h3>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {pharmacies.map((pharmacy) => (
                  <button
                    key={pharmacy.id}
                    onClick={() => handleSelectPharmacy(pharmacy)}
                    className={cn(
                      'flex w-full items-center gap-3 border-b border-slate-50 p-3 text-left transition-colors',
                      selectedPharmacy?.id === pharmacy.id ? 'bg-teal-50' : 'hover:bg-slate-50'
                    )}
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-teal-50 to-emerald-50 text-xs font-bold text-emerald-deep ring-1 ring-teal-200/40">
                      {pharmacy.name.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold text-slate-800">{pharmacy.name}</div>
                      <div className="text-[10px] text-slate-400">{pharmacy.city}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Inventory management */}
          <div className="lg:col-span-9">
            {selectedPharmacy ? (
              <div className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm">
                <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">{selectedPharmacy.name} — Inventory</h3>
                    <p className="text-xs text-slate-500">Update prices, stock, and discounts</p>
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
                      {filteredMedicines.map((med) => (
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
                              <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold', availabilityConfig[med.availability].color, availabilityConfig[med.availability].bg)}>
                                <span className={cn('h-1.5 w-1.5 rounded-full', availabilityConfig[med.availability].dot)} />
                                {availabilityConfig[med.availability].label}
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-right">
                            {editingId === med.id ? (
                              <div className="flex justify-end gap-1">
                                <button onClick={() => handleSave(med.id)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 hover:bg-emerald-200">
                                  <Check className="h-4 w-4" />
                                </button>
                                <button onClick={() => setEditingId(null)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200">
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => handleEdit(med)} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-teal-100 hover:text-emerald-deep">
                                <Edit2 className="h-3 w-3" />
                                Edit
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {filteredMedicines.length === 0 && (
                  <div className="p-12 text-center">
                    <Package className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="mt-2 text-sm text-slate-400">No medicines found</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex h-full min-h-64 flex-col items-center justify-center rounded-2xl border border-slate-200/60 bg-white p-12 text-center">
                <Store className="h-10 w-10 text-slate-300" />
                <p className="mt-4 text-sm font-medium text-slate-500">Select a pharmacy to manage inventory</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: typeof Package; label: string; value: string; color: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm"
    >
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${color} text-white shadow-md`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="mt-3 text-2xl font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </motion.div>
  );
}
