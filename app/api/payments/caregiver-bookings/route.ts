import { NextResponse } from 'next/server';
import { authenticatePaymentRequest } from '@/lib/payments/auth';

export async function GET(request: Request) {
  const auth = await authenticatePaymentRequest(request);
  if (!auth) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (auth.unavailable) {
    return NextResponse.json({ error: 'Payment database configuration is missing on the server.' }, { status: 503 });
  }

  const { data: bookings, error } = await auth.admin.from('caregiver_payment_bookings')
    .select('id, payment_order_id, caregiver_id, service_id, requested_date, requested_start_time, requested_end_time, status, created_at')
    .eq('patient_id', auth.user.id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: 'Unable to load your caregiver bookings.' }, { status: 500 });
  if (!bookings?.length) return NextResponse.json({ bookings: [] });

  const orderIds = bookings.map((booking) => booking.payment_order_id);
  const [ordersResult, itemsResult] = await Promise.all([
    auth.admin.from('payment_orders').select('id, status').in('id', orderIds),
    auth.admin.from('payment_order_items').select('order_id, description').in('order_id', orderIds),
  ]);
  if (ordersResult.error || itemsResult.error) {
    return NextResponse.json({ error: 'Unable to load caregiver booking payment status.' }, { status: 500 });
  }

  return NextResponse.json({
    bookings: bookings.map((booking) => ({
      ...booking,
      payment_status: ordersResult.data?.find((order) => order.id === booking.payment_order_id)?.status ?? 'unknown',
      service_name: itemsResult.data?.find((item) => item.order_id === booking.payment_order_id)?.description ?? 'Caregiver service',
    })),
  });
}
