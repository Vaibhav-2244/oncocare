"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { MessageCircle, RefreshCw, Send } from "lucide-react";

import { Card } from "@/components/ui/Card";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  getPatientMessages,
  sendPatientMessage,
} from "@/features/messages/message.service";
import type { PatientMessage } from "@/types";

interface MessagesPanelProps {
  patientId: string;
  currentUserId?: string | null;
}

function formatMessageTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function MessagesPanel({
  patientId,
  currentUserId = null,
}: MessagesPanelProps) {
  const [messages, setMessages] = useState<PatientMessage[]>([]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMessages() {
    try {
      setLoading(true);
      setError(null);

      const data = await getPatientMessages(patientId);
      setMessages(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load messages."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMessages();
  }, [patientId]);

  const canSend = useMemo(
    () => content.trim().length > 0 && !sending,
    [content, sending]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedContent = content.trim();

    if (!trimmedContent || sending) {
      return;
    }

    try {
      setSending(true);
      setError(null);

      const created = await sendPatientMessage(
        patientId,
        trimmedContent
      );

      setMessages((current) => [...current, created]);
      setContent("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to send message."
      );
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return <LoadingState />;
  }

  if (error && messages.length === 0) {
    return (
      <ErrorState
        title="Unable to load messages"
      />
    );
  }

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-[#0F766E]">
              <MessageCircle className="h-5 w-5" />
            </div>

            <div>
              <h2 className="text-base font-semibold text-[#1F2937]">
                Patient messages
              </h2>
              <p className="text-sm text-gray-500">
                Direct communication with the patient
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void loadMessages()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        <div className="min-h-[360px] space-y-4 bg-[#F5F7FA] p-5">
          {messages.length === 0 ? (
            <EmptyState
              title="No messages yet"
            />
          ) : (
            messages.map((message) => {
              const isMine =
                currentUserId !== null &&
                message.sender_id === currentUserId;

              return (
                <div
                  key={message.id}
                  className={`flex ${
                    isMine ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 shadow-sm ${
                      isMine
                        ? "rounded-br-md bg-[#0F766E] text-white"
                        : "rounded-bl-md border border-gray-200 bg-white text-[#1F2937]"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words text-sm leading-6">
                      {message.content}
                    </p>

                    <p
                      className={`mt-1.5 text-[11px] ${
                        isMine
                          ? "text-teal-100"
                          : "text-gray-400"
                      }`}
                    >
                      {formatMessageTime(message.created_at)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="border-t border-gray-100 bg-white p-4"
        >
          {error && messages.length > 0 && (
            <div className="mb-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex items-end gap-3">
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Write a message..."
              rows={2}
              maxLength={5000}
              disabled={sending}
              className="min-h-[52px] flex-1 resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm text-[#1F2937] outline-none transition placeholder:text-gray-400 focus:border-[#2EC4B6] focus:ring-2 focus:ring-[#2EC4B6]/20 disabled:bg-gray-50"
            />

            <button
              type="submit"
              disabled={!canSend}
              className="inline-flex h-[52px] items-center gap-2 rounded-xl bg-[#0F766E] px-5 text-sm font-semibold text-white transition hover:bg-[#115E59] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {sending ? "Sending..." : "Send"}
            </button>
          </div>

          <div className="mt-2 text-right text-xs text-gray-400">
            {content.length}/5000
          </div>
        </form>
      </Card>
    </div>
  );
}