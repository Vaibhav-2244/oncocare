"use client";

import {
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Clock3,
  ListChecks,
  Loader2,
  Plus,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";

import {
  createPatientTask,
  getPatientTasks,
  updatePatientTaskStatus,
} from "@/features/tasks/task.service";

import type {
  CaregiverTask,
  TaskPriority,
  TaskStatus,
  TaskType,
} from "@/types";

interface TasksPanelProps {
  patientId: string;
}

const TASK_TYPES: {
  value: TaskType;
  label: string;
}[] = [
  { value: "care", label: "Care" },
  { value: "appointment", label: "Appointment" },
  { value: "medication", label: "Medication" },
  { value: "investigation", label: "Investigation" },
  {
    value: "doctor_instruction",
    label: "Doctor instruction",
  },
  { value: "other", label: "Other" },
];

const PRIORITIES: {
  value: TaskPriority;
  label: string;
}[] = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

function formatDateTime(value: string | null) {
  if (!value) return "No due time";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function isOverdue(task: CaregiverTask) {
  if (!task.due_at) return false;

  if (
    task.status === "completed" ||
    task.status === "cancelled"
  ) {
    return false;
  }

  return new Date(task.due_at).getTime() < Date.now();
}

function priorityClasses(priority: TaskPriority) {
  switch (priority) {
    case "urgent":
      return "bg-red-50 text-red-700 border-red-100";

    case "high":
      return "bg-orange-50 text-orange-700 border-orange-100";

    case "low":
      return "bg-gray-50 text-gray-600 border-gray-100";

    default:
      return "bg-blue-50 text-blue-700 border-blue-100";
  }
}

function statusClasses(status: TaskStatus) {
  switch (status) {
    case "completed":
      return "bg-emerald-50 text-emerald-700";

    case "in_progress":
      return "bg-blue-50 text-blue-700";

    case "cancelled":
      return "bg-gray-100 text-gray-500";

    default:
      return "bg-amber-50 text-amber-700";
  }
}

function statusLabel(status: TaskStatus) {
  switch (status) {
    case "in_progress":
      return "In progress";

    case "completed":
      return "Completed";

    case "cancelled":
      return "Cancelled";

    default:
      return "Pending";
  }
}

function taskTypeLabel(type: TaskType) {
  return (
    TASK_TYPES.find((item) => item.value === type)
      ?.label ?? "Care"
  );
}

export function TasksPanel({
  patientId,
}: TasksPanelProps) {
  const [tasks, setTasks] = useState<CaregiverTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [showComposer, setShowComposer] =
    useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] =
    useState("");
  const [taskType, setTaskType] =
    useState<TaskType>("care");
  const [priority, setPriority] =
    useState<TaskPriority>("normal");
  const [dueAt, setDueAt] = useState("");

  const [updatingTaskId, setUpdatingTaskId] =
    useState<string | null>(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadTasks(isRefresh = false) {
    try {
      setError("");

      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const data = await getPatientTasks(patientId);

      setTasks(data);
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error &&
          err.message === "PATIENT_ACCESS_DENIED"
          ? "You are not authorized to access this patient's tasks."
          : "We couldn't load the tasks. Please try again.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadTasks();
  }, [patientId]);

  const summary = useMemo(() => {
    return {
      pending: tasks.filter(
        (task) => task.status === "pending",
      ).length,

      inProgress: tasks.filter(
        (task) => task.status === "in_progress",
      ).length,

      completed: tasks.filter(
        (task) => task.status === "completed",
      ).length,

      overdue: tasks.filter(isOverdue).length,
    };
  }, [tasks]);

  async function handleCreateTask(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!title.trim()) {
      setError("Please enter a task title.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const created = await createPatientTask(
        patientId,
        {
          title: title.trim(),
          description:
            description.trim() || undefined,
          taskType,
          priority,
          dueAt: dueAt
            ? new Date(dueAt).toISOString()
            : null,
        },
      );

      setTasks((current) => [
        created,
        ...current,
      ]);

      setTitle("");
      setDescription("");
      setTaskType("care");
      setPriority("normal");
      setDueAt("");
      setShowComposer(false);

      setSuccess("Task created successfully.");

      window.setTimeout(() => {
        setSuccess("");
      }, 3000);
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error &&
          err.message === "PATIENT_ACCESS_DENIED"
          ? "You are no longer authorized to create tasks for this patient."
          : "The task could not be created. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(
    task: CaregiverTask,
    status: TaskStatus,
  ) {
    try {
      setUpdatingTaskId(task.id);
      setError("");

      const updated =
        await updatePatientTaskStatus(
          patientId,
          task.id,
          status,
        );

      setTasks((current) =>
        current.map((item) =>
          item.id === updated.id
            ? updated
            : item,
        ),
      );
    } catch (err) {
      console.error(err);

      setError(
        "The task status could not be updated. Please try again.",
      );
    } finally {
      setUpdatingTaskId(null);
    }
  }

  if (loading) {
    return <LoadingState lines={6} />;
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Pending"
          value={summary.pending}
          icon={<Clock3 size={18} />}
        />

        <SummaryCard
          label="In progress"
          value={summary.inProgress}
          icon={<ListChecks size={18} />}
        />

        <SummaryCard
          label="Completed"
          value={summary.completed}
          icon={<CheckCircle2 size={18} />}
        />

        <SummaryCard
          label="Overdue"
          value={summary.overdue}
          icon={<CircleAlert size={18} />}
          danger={summary.overdue > 0}
        />
      </div>

      {/* Header */}
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 className="font-semibold text-gray-900">
              Care tasks
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Things that need to be completed for this patient
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void loadTasks(true)}
              disabled={refreshing}
              className="rounded-lg border border-gray-200 p-2.5 text-gray-500 transition hover:bg-gray-50 disabled:opacity-50"
              title="Refresh tasks"
            >
              <RefreshCw
                size={17}
                className={
                  refreshing ? "animate-spin" : ""
                }
              />
            </button>

            <button
              type="button"
              onClick={() =>
                setShowComposer((current) => !current)
              }
              className="inline-flex items-center gap-2 rounded-xl bg-[#0F766E] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0B625C]"
            >
              <Plus size={17} />
              Add task
            </button>
          </div>
        </div>

        {/* Composer */}
        {showComposer && (
          <form
            onSubmit={handleCreateTask}
            className="space-y-5 border-b border-gray-100 bg-[#F8FAFC] p-5 sm:p-6"
          >
            <div>
              <label
                htmlFor="task-title"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Task
              </label>

              <input
                id="task-title"
                value={title}
                onChange={(event) =>
                  setTitle(event.target.value)
                }
                maxLength={250}
                disabled={saving}
                placeholder="Example: Take patient for CBC"
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#2EC4B6] focus:ring-2 focus:ring-[#2EC4B6]/20"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <SelectField
                label="Type"
                value={taskType}
                onChange={(value) =>
                  setTaskType(value as TaskType)
                }
                options={TASK_TYPES}
              />

              <SelectField
                label="Priority"
                value={priority}
                onChange={(value) =>
                  setPriority(value as TaskPriority)
                }
                options={PRIORITIES}
              />

              <div>
                <label
                  htmlFor="task-due"
                  className="mb-2 block text-sm font-medium text-gray-700"
                >
                  Due date & time
                </label>

                <input
                  id="task-due"
                  type="datetime-local"
                  value={dueAt}
                  onChange={(event) =>
                    setDueAt(event.target.value)
                  }
                  disabled={saving}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#2EC4B6] focus:ring-2 focus:ring-[#2EC4B6]/20"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="task-description"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Details
              </label>

              <textarea
                id="task-description"
                value={description}
                onChange={(event) =>
                  setDescription(event.target.value)
                }
                rows={3}
                disabled={saving}
                placeholder="Add any useful context for completing this task."
                className="w-full resize-y rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm outline-none focus:border-[#2EC4B6] focus:ring-2 focus:ring-[#2EC4B6]/20"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() =>
                  setShowComposer(false)
                }
                disabled={saving}
                className="rounded-xl px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-white"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={saving || !title.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0F766E] px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2
                      size={16}
                      className="animate-spin"
                    />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus size={16} />
                    Create task
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {error && (
          <div className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm text-red-700 sm:px-6">
            {error}
          </div>
        )}

        {success && (
          <div className="border-b border-emerald-100 bg-emerald-50 px-5 py-3 text-sm text-emerald-700 sm:px-6">
            {success}
          </div>
        )}

        {/* Tasks */}
        {tasks.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No tasks yet"
              description="Create a task for this patient's care plan."
            />
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {tasks.map((task) => {
              const overdue = isOverdue(task);
              const updating =
                updatingTaskId === task.id;

              return (
                <div
                  key={task.id}
                  className="p-5 transition hover:bg-gray-50/70 sm:p-6"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-gray-900">
                          {task.title}
                        </h3>

                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClasses(task.status)}`}
                        >
                          {statusLabel(task.status)}
                        </span>

                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-medium ${priorityClasses(task.priority)}`}
                        >
                          {task.priority.charAt(0).toUpperCase() +
                            task.priority.slice(1)}
                        </span>
                      </div>

                      <p className="mt-2 text-xs font-medium text-gray-400">
                        {taskTypeLabel(task.task_type)}
                      </p>

                      {task.description && (
                        <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-600">
                          {task.description}
                        </p>
                      )}

                      <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-500">
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarClock size={14} />
                          {task.due_at
                            ? formatDateTime(task.due_at)
                            : "No due date"}
                        </span>

                        {overdue && (
                          <span className="font-medium text-red-600">
                            Overdue
                          </span>
                        )}

                        {task.completed_at && (
                          <span className="inline-flex items-center gap-1.5 text-emerald-600">
                            <CheckCircle2 size={14} />
                            Completed{" "}
                            {formatDateTime(
                              task.completed_at,
                            )}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    {task.status !== "completed" &&
                      task.status !== "cancelled" && (
                        <div className="flex shrink-0 flex-wrap gap-2">
                          {task.status === "pending" && (
                            <button
                              type="button"
                              disabled={updating}
                              onClick={() =>
                                void changeStatus(
                                  task,
                                  "in_progress",
                                )
                              }
                              className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                            >
                              {updating ? (
                                <Loader2
                                  size={14}
                                  className="animate-spin"
                                />
                              ) : (
                                "Start task"
                              )}
                            </button>
                          )}

                          {task.status ===
                            "in_progress" && (
                            <button
                              type="button"
                              disabled={updating}
                              onClick={() =>
                                void changeStatus(
                                  task,
                                  "completed",
                                )
                              }
                              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F766E] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0B625C] disabled:opacity-50"
                            >
                              {updating ? (
                                <Loader2
                                  size={14}
                                  className="animate-spin"
                                />
                              ) : (
                                <CheckCircle2 size={14} />
                              )}
                              Complete
                            </button>
                          )}

                          <button
                            type="button"
                            disabled={updating}
                            onClick={() =>
                              void changeStatus(
                                task,
                                "cancelled",
                              )
                            }
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                          >
                            <XCircle size={14} />
                            Cancel
                          </button>
                        </div>
                      )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  danger = false,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-lg ${
            danger
              ? "bg-red-50 text-red-600"
              : "bg-[#E8F8F6] text-[#0F766E]"
          }`}
        >
          {icon}
        </div>

        <span
          className={`text-2xl font-semibold ${
            danger && value > 0
              ? "text-red-600"
              : "text-gray-900"
          }`}
        >
          {value}
        </span>
      </div>

      <p className="mt-3 text-sm text-gray-500">
        {label}
      </p>
    </Card>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: {
    value: string;
    label: string;
  }[];
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-gray-700">
        {label}
      </label>

      <select
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#2EC4B6] focus:ring-2 focus:ring-[#2EC4B6]/20"
      >
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
          >
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}