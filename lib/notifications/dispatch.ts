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

export async function dispatchNotification(_input: DispatchNotificationInput): Promise<boolean> {
  return true;
}

export async function sendSms(_message: string, _to?: string): Promise<boolean> {
  return true;
}

export async function sendWhatsapp(_message: string, _to?: string): Promise<boolean> {
  return true;
}

export async function sendPush(_message: string, _userId?: string): Promise<boolean> {
  return true;
}
