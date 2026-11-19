import { NextResponse } from 'next/server';
import { authenticatePaymentRequest } from '@/lib/payments/auth';

export async function GET(request: Request) {
  const auth = await authenticatePaymentRequest(request);
  if (!auth) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (auth.unavailable) {
    return NextResponse.json({ error: 'Payment database configuration is missing on the server.' }, { status: 503 });
  }

  const { data: payments, error } = await auth.admin.from('payment_orders')
    .select('id, kind, status, amount_in_paise, currency, payment_mode, is_demo, provider_order_id, provider_payment_id, provider_refund_id, failure_reason, created_at, updated_at')
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: 'Unable to load payment history.' }, { status: 500 });

  if (!payments?.length) return NextResponse.json({ payments: [] });
  const orderIds = payments.map((payment) => payment.id);
  const [refundsResult, itemsResult] = await Promise.all([
    auth.admin.from('payment_refunds')
      .select('id, order_id, amount_in_paise, status, provider_refund_id, created_at')
      .in('order_id', orderIds),
    auth.admin.from('payment_order_items')
      .select('order_id, description, quantity')
      .in('order_id', orderIds),
  ]);
  if (refundsResult.error || itemsResult.error) {
    return NextResponse.json({ error: 'Unable to load payment history details.' }, { status: 500 });
  }

  return NextResponse.json({
    payments: payments.map((payment) => ({
      ...payment,
      refunds: refundsResult.data?.filter((refund) => refund.order_id === payment.id) ?? [],
      items: itemsResult.data?.filter((item) => item.order_id === payment.id) ?? [],
    })),
  });
}
