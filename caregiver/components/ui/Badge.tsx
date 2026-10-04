import type { HTMLAttributes } from "react";

type BadgeVariant =
  | "default"
  | "success"
  | "info"
  | "warning"
  | "error";

interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
  variant?: BadgeVariant;
}

const variantClasses: Record<
  BadgeVariant,
  string
> = {
  default:
    "bg-gray-100 text-gray-700 border-gray-200",
  success:
    "bg-green-50 text-green-700 border-green-200",
  info:
    "bg-blue-50 text-blue-700 border-blue-200",
  warning:
    "bg-amber-50 text-amber-700 border-amber-200",
  error:
    "bg-red-50 text-red-700 border-red-200",
};

export function Badge({
  children,
  variant = "default",
  className = "",
  ...props
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}