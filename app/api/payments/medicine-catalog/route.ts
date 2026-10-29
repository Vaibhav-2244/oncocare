import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const admin = createSupabaseAdminClient();
  const { data: rows, error } = await admin.from('pharmacy_products')
    .select('id, pharmacy_id, name, strength, form, selling_price, requires_prescription, pharmacy:pharmacy_orgs!inner(id, name, verification_status, accepts_online_orders, listing_enabled, home_delivery, online_delivery_fee_in_paise)')
    .eq('is_active', true)
    .order('name')
    .limit(200);
  if (error) return NextResponse.json({ error: 'Unable to load the approved medicine catalogue.' }, { status: 503 });

  const products = (rows ?? []).flatMap((row) => {
    const pharmacy = Array.isArray(row.pharmacy) ? row.pharmacy[0] : row.pharmacy;
    if (
      !pharmacy
      || pharmacy.verification_status !== 'verified'
      || !pharmacy.accepts_online_orders
      || !pharmacy.listing_enabled
      || !pharmacy.home_delivery
      || pharmacy.online_delivery_fee_in_paise === null
      || pharmacy.online_delivery_fee_in_paise === undefined
    ) return [];
    return [{
      id: row.id,
      pharmacyId: row.pharmacy_id,
      pharmacyName: pharmacy.name,
      deliveryFeeInPaise: Number(pharmacy.online_delivery_fee_in_paise),
      name: row.name,
      strength: row.strength,
      form: row.form,
      sellingPrice: Number(row.selling_price),
      requiresPrescription: row.requires_prescription,
    }];
  });
  if (!products.length) return NextResponse.json({ products: [] });

  const { data: stocks, error: stockError } = await admin.from('pharmacy_product_stock')
    .select('product_id, available')
    .in('product_id', products.map((product) => product.id));
  if (stockError) return NextResponse.json({ error: 'Unable to load current medicine availability.' }, { status: 503 });

  const availableByProduct = new Map((stocks ?? []).map((stock) => [stock.product_id, Number(stock.available)]));
  return NextResponse.json({
    products: products.filter((product) => (availableByProduct.get(product.id) ?? 0) > 0),
  });
}
