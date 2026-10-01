type StructuredError = {
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  code?: unknown;
};

export function getErrorMessage(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const error = err as StructuredError;
    const parts = [error.message, error.details, error.hint, error.code]
      .filter((part): part is string | number => typeof part === 'string' || typeof part === 'number')
      .map(String);
    if (parts.length > 0) return parts.join(' · ');
  }
  return 'An unexpected error occurred.';
}