export type NotificationChannel = 'in_app';

export interface DispatchNotificationInput {
  userId?: string;
  hospitalId?: string;
  type: string;
  title?: string;
  message: string;
  refTable?: string;
  refId?: string;
  dedupeKey?: string;
}

import { supabase } from '@/lib/supabase-client';

export async function dispatchNotification(input: DispatchNotificationInput): Promise<boolean> {
  if (!input.userId) {
    throw new Error('In-app notifications require a recipient user ID.');
  }

  const { error } = await supabase.from('notifications').insert({
    user_id: input.userId,
    type: input.type,
    title: input.title || input.type,
    message: input.message,
  });
  if (error) throw error;
  return true;
}

export async function sendSms(): Promise<boolean> {
  throw new Error('SMS notifications are not configured.');
}

export async function sendWhatsapp(): Promise<boolean> {
  throw new Error('WhatsApp notifications are not configured.');
}

export async function sendPush(): Promise<boolean> {
  throw new Error('Push notifications are not configured.');
}
