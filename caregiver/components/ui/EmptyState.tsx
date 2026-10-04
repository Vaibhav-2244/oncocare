import { Inbox } from "lucide-react";

import { Card } from "./Card";

interface EmptyStateProps {
  title: string;
  description?: string;
}

export function EmptyState({
  title,
  description,
}: EmptyStateProps) {
  return (
    <Card className="p-8">
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
          <Inbox size={23} />
        </div>

        <h2 className="mt-4 text-lg font-semibold text-gray-900">
          {title}
        </h2>

        {description && (
          <p className="mt-2 text-sm leading-6 text-gray-500">
            {description}
          </p>
        )}
      </div>
    </Card>
  );
}