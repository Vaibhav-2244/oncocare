import { supabase } from './supabase-client';
import type {
  Medicine,
  MedicinePrice,
  Pharmacy,
  PharmacyReview,
  GenericAlternative,
  WatchlistItem,
  FavouritePharmacy,
  RecentlyViewed,
  Availability,
} from './medicine-types';

export async function searchMedicines(query: string): Promise<Medicine[]> {
  if (!query.trim()) {
    const { data, error } = await supabase
      .from('medicines')
      .select('*')
      .order('name')
      .limit(20);
    if (error) throw error;
    return data || [];
  }

  const { data, error } = await supabase
    .from('medicines')
    .select('*')
    .or(`name.ilike.%${query}%,generic_name.ilike.%${query}%,manufacturer.ilike.%${query}%,category.ilike.%${query}%`)
    .order('name')
    .limit(20);

  if (error) throw error;
  return data || [];
}

export async function getMedicineById(id: string): Promise<Medicine | null> {
  const { data, error } = await supabase
    .from('medicines')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getMedicinePrices(medicineId: string): Promise<MedicinePrice[]> {
  const { data, error } = await supabase
    .from('medicine_prices')
    .select(`
      *,
      pharmacy:pharmacies(*)
    `)
    .eq('medicine_id', medicineId)
    .order('current_price', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function getGenericAlternatives(medicineId: string): Promise<GenericAlternative[]> {
  const { data, error } = await supabase
    .from('generic_alternatives')
    .select(`
      *,
      generic_medicine:medicines!generic_alternatives_generic_medicine_id_fkey(*),
      brand_medicine:medicines!generic_alternatives_brand_medicine_id_fkey(*)
    `)
    .or(`brand_medicine_id.eq.${medicineId},generic_medicine_id.eq.${medicineId}`);

  if (error) throw error;
  return data || [];
}

export async function getAllPharmacies(): Promise<Pharmacy[]> {
  const { data, error } = await supabase
    .from('pharmacies')
    .select('*')
    .order('rating', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getPharmacyById(id: string): Promise<Pharmacy | null> {
  const { data, error } = await supabase
    .from('pharmacies')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getPharmacyReviews(pharmacyId: string): Promise<PharmacyReview[]> {
  const { data, error } = await supabase
    .from('pharmacy_reviews')
    .select('*')
    .eq('pharmacy_id', pharmacyId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getPharmacyMedicines(pharmacyId: string): Promise<MedicinePrice[]> {
  const { data, error } = await supabase
    .from('medicine_prices')
    .select(`
      *,
      medicine:medicines(*)
    `)
    .eq('pharmacy_id', pharmacyId)
    .order('current_price', { ascending: true })
    .limit(20);

  if (error) throw error;
  return data || [];
}

// Watchlist
export async function getWatchlist(userId: string): Promise<WatchlistItem[]> {
  const { data, error } = await supabase
    .from('user_watchlist')
    .select(`
      *,
      medicine:medicines(*)
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function addToWatchlist(userId: string, medicineId: string, priceAlertThreshold?: number, notifyRestock?: boolean): Promise<void> {
  const { error } = await supabase
    .from('user_watchlist')
    .insert({
      user_id: userId,
      medicine_id: medicineId,
      price_alert_threshold: priceAlertThreshold || null,
      notify_restock: notifyRestock || false,
    });
  if (error) throw error;
}

export async function removeFromWatchlist(userId: string, id: string): Promise<void> {
  const { error } = await supabase
    .from('user_watchlist')
    .delete()
    .eq('user_id', userId)
    .eq('id', id);
  if (error) throw error;
}

// Favourite pharmacies
export async function getFavouritePharmacies(userId: string): Promise<FavouritePharmacy[]> {
  const { data, error } = await supabase
    .from('user_favourite_pharmacies')
    .select(`
      *,
      pharmacy:pharmacies(*)
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function toggleFavouritePharmacy(userId: string, pharmacyId: string): Promise<boolean> {
  const { data: existing } = await supabase
    .from('user_favourite_pharmacies')
    .select('id')
    .eq('user_id', userId)
    .eq('pharmacy_id', pharmacyId)
    .maybeSingle();

  if (existing) {
    await supabase.from('user_favourite_pharmacies').delete().eq('user_id', userId).eq('id', existing.id);
    return false;
  } else {
    await supabase.from('user_favourite_pharmacies').insert({ user_id: userId, pharmacy_id: pharmacyId });
    return true;
  }
}

// Recently viewed
export async function addToRecentlyViewed(userId: string, medicineId: string): Promise<void> {
  await supabase.from('recently_viewed').delete().eq('user_id', userId).eq('medicine_id', medicineId);
  const { error } = await supabase
    .from('recently_viewed')
    .insert({ user_id: userId, medicine_id: medicineId });
  if (error) throw error;
}

export async function getRecentlyViewed(userId: string): Promise<RecentlyViewed[]> {
  const { data, error } = await supabase
    .from('recently_viewed')
    .select(`
      *,
      medicine:medicines(*)
    `)
    .eq('user_id', userId)
    .order('viewed_at', { ascending: false })
    .limit(8);

  if (error) throw error;
  return data || [];
}

// Admin: update price
export async function updateMedicinePrice(
  priceId: string,
  currentPrice: number,
  discountPercent: number,
  availability: Availability
): Promise<void> {
  const { error } = await supabase
    .from('medicine_prices')
    .update({
      current_price: currentPrice,
      discount_percent: discountPercent,
      availability,
      updated_at: new Date().toISOString(),
    })
    .eq('id', priceId);
  if (error) throw error;
}

// Admin: update pharmacy
export async function updatePharmacy(
  pharmacyId: string,
  updates: Partial<Pharmacy>
): Promise<void> {
  const { error } = await supabase
    .from('pharmacies')
    .update(updates)
    .eq('id', pharmacyId);
  if (error) throw error;
}
