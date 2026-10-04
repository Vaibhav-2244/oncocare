import { supabase } from "@/lib/supabase/client";
import type { CaregiverNotification } from "@/types";

export async function getNotifications(): Promise<
  CaregiverNotification[]
> {
  const { data, error } = await supabase.rpc(
    "get_my_caregiver_notifications",
  );

  if (error) {
    throw error;
  }

  return (data ?? []) as CaregiverNotification[];
}

export async function markNotificationAsRead(
  notificationId: string,
): Promise<CaregiverNotification> {
  const { data, error } = await supabase.rpc(
    "mark_caregiver_notification_as_read",
    {
      target_notification_id: notificationId,
    },
  );

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("NOTIFICATION_UPDATE_FAILED");
  }

  return data as CaregiverNotification;
}