export type Availability = 'in_stock' | 'low_stock' | 'out_of_stock';

export interface Pharmacy {
  id: string;
  name: string;
  logo_url: string | null;
  address: string;
  city: string;
  state: string;
  pincode: string | null;
  latitude: number | null;
  longitude: number | null;
  contact_number: string | null;
  operating_hours: string;
  is_24x7: boolean;
  home_delivery: boolean;
  cancer_medicines: boolean;
  injectables: boolean;
  discount_available: boolean;
  is_verified: boolean;
  rating: number;
  review_count: number;
  gst_number: string | null;
  license_number: string | null;
  created_at: string;
}

export interface PharmacyReview {
  id: string;
  pharmacy_id: string;
  author_name: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

export interface Medicine {
  id: string;
  name: string;
  generic_name: string | null;
  category: string | null;
  strength: string | null;
  form: string;
  manufacturer: string | null;
  prescription_required: boolean;
  mrp: number;
  description: string | null;
  image_url: string | null;
  is_oncology: boolean;
  created_at: string;
}

export interface MedicinePrice {
  id: string;
  medicine_id: string;
  pharmacy_id: string;
  current_price: number;
  discount_percent: number;
  availability: Availability;
  distance_km: number;
  delivery_time_hours: number;
  updated_at: string;
  pharmacy?: Pharmacy;
  medicine?: Medicine;
}

export interface GenericAlternative {
  id: string;
  brand_medicine_id: string;
  generic_medicine_id: string;
  estimated_savings: number;
  is_doctor_approved: boolean;
  generic_medicine?: Medicine;
  brand_medicine?: Medicine;
}

export interface WatchlistItem {
  id: string;
  user_id: string | null;
  medicine_id: string;
  price_alert_threshold: number | null;
  notify_restock: boolean;
  created_at: string;
  medicine?: Medicine;
}

export interface FavouritePharmacy {
  id: string;
  user_id: string | null;
  pharmacy_id: string;
  created_at: string;
  pharmacy?: Pharmacy;
}

export interface RecentlyViewed {
  id: string;
  user_id: string | null;
  medicine_id: string;
  viewed_at: string;
  medicine?: Medicine;
}

export interface MedicineWithPrices extends Medicine {
  prices?: MedicinePrice[];
  lowest_price?: number;
  best_pharmacy?: string;
  availability_status?: Availability;
}

export const availabilityConfig: Record<Availability, { label: string; color: string; bg: string; dot: string }> = {
  in_stock: { label: 'In Stock', color: 'text-emerald-600', bg: 'bg-emerald-50', dot: 'bg-emerald-500' },
  low_stock: { label: 'Low Stock', color: 'text-amber-600', bg: 'bg-amber-50', dot: 'bg-amber-500' },
  out_of_stock: { label: 'Out of Stock', color: 'text-slate-500', bg: 'bg-slate-100', dot: 'bg-slate-400' },
};

export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export const popularSearches = [
  'Pembrolizumab',
  'Imatinib',
  'Tamoxifen',
  'Trastuzumab',
  'Capecitabine',
  'Doxorubicin',
];
