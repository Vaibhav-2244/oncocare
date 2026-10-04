"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  Check,
  CheckCheck,
  RefreshCw,
} from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";

import {
  getNotifications,
  markNotificationAsRead,
} from "@/features/notifications/notification.service";

import type { CaregiverNotification } from "@/types";

function formatNotificationTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function getNotificationTypeLabel(type?: string | null) {
  if (!type) {
    return "Notification";
  }

  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<
    CaregiverNotification[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function loadNotifications() {
    try {
      setLoading(true);
      setError(null);

      const data = await getNotifications();
      setNotifications(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load notifications."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadNotifications();
  }, []);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.is_read).length,
    [notifications]
  );

  async function handleMarkAsRead(notificationId: string) {
    try {
      setUpdatingId(notificationId);
      setError(null);

      const updated = await markNotificationAsRead(notificationId);

      setNotifications((current) =>
        current.map((notification) =>
          notification.id === updated.id
            ? { ...notification, ...updated }
            : notification
        )
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to update notification."
      );
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleMarkAllAsRead() {
    const unreadNotifications = notifications.filter(
      (notification) => !notification.is_read
    );

    for (const notification of unreadNotifications) {
      try {
        setUpdatingId(notification.id);

        const updated = await markNotificationAsRead(notification.id);

        setNotifications((current) =>
          current.map((item) =>
            item.id === updated.id
              ? { ...item, ...updated }
              : item
          )
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to mark all notifications as read."
        );
        break;
      } finally {
        setUpdatingId(null);
      }
    }
  }

  if (loading) {
    return (
      <AppShell>
        <LoadingState />
      </AppShell>
    );
  }

  if (error && notifications.length === 0) {
    return (
      <AppShell>
        <ErrorState title="Unable to load notifications" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-[#0F766E]">
              <Bell className="h-5 w-5" />
            </div>

            <div>
              <h1 className="text-2xl font-semibold text-[#1F2937]">
                Notifications
              </h1>

              <p className="text-sm text-gray-500">
                {unreadCount > 0
                  ? `${unreadCount} unread notification${
                      unreadCount === 1 ? "" : "s"
                    }`
                  : "You're all caught up."}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void loadNotifications()}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void handleMarkAllAsRead()}
                disabled={updatingId !== null}
                className="inline-flex items-center gap-2 rounded-lg bg-[#0F766E] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#115E59] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCheck className="h-4 w-4" />
                Mark all read
              </button>
            )}
          </div>
        </div>

        {error && notifications.length > 0 && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {notifications.length === 0 ? (
          <EmptyState title="No notifications" />
        ) : (
          <div className="space-y-3">
            {notifications.map((notification) => {
              const unread = !notification.is_read;
              const updating = updatingId === notification.id;

              return (
                <Card
                  key={notification.id}
                  className={`p-5 transition ${
                    unread
                      ? "border-[#2EC4B6]/30 bg-[#F8FFFE]"
                      : "bg-white"
                  }`}
                >
                  <div className="flex gap-4">
                    <div
                      className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                        unread
                          ? "bg-[#E6F7F5] text-[#0F766E]"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      <Bell className="h-5 w-5" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="font-semibold text-[#1F2937]">
                              {notification.title}
                            </h2>

                            {unread && (
                              <span className="rounded-full bg-[#2EC4B6]/10 px-2 py-0.5 text-xs font-medium text-[#0F766E]">
                                New
                              </span>
                            )}
                          </div>

                          <p className="mt-1 text-xs font-medium text-gray-400">
                            {getNotificationTypeLabel(notification.type)}
                            {notification.patient_name
                              ? ` · ${notification.patient_name}`
                              : ""}
                          </p>
                        </div>

                        <span className="shrink-0 text-xs text-gray-400">
                          {formatNotificationTime(
                            notification.created_at
                          )}
                        </span>
                      </div>

                      <p className="mt-3 text-sm leading-6 text-gray-600">
                        {notification.message}
                      </p>

                      {unread && (
                        <button
                          type="button"
                          onClick={() =>
                            void handleMarkAsRead(notification.id)
                          }
                          disabled={updating}
                          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Check className="h-3.5 w-3.5" />
                          {updating ? "Updating..." : "Mark as read"}
                        </button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}