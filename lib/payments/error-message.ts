const SENSITIVE_VALUE = /\b(?:rzp_(?:live|test)_[A-Za-z0-9]+|sk_(?:live|test)_[A-Za-z0-9]+)\b/gi;

function safeMessage(value: string): string {
  return value
    .replace(SENSITIVE_VALUE, '[redacted]')
    .replace(/((?:key[_ -]?secret|service[_ -]?role[_ -]?key|authorization)\s*[:=]\s*)\S+/gi, '$1[redacted]')
    .trim();
}

export function normalizePaymentError(value: unknown, fallback = 'Payment could not be completed. Please try again.'): string {
  if (typeof value === 'string') return safeMessage(value) || fallback;
  if (value instanceof Error) return safeMessage(value.message) || fallback;
  if (Array.isArray(value)) {
    const messages = value
      .map((item) => normalizePaymentError(item, ''))
      .filter(Boolean);
    return messages.length ? messages.join(' ') : fallback;
  }
  if (!value || typeof value !== 'object') return fallback;

  const record = value as Record<string, unknown>;
  if (typeof record.message === 'string' && record.message.trim()) return safeMessage(record.message);
  if (typeof record.error === 'string' && record.error.trim()) return safeMessage(record.error);
  if (record.error && typeof record.error === 'object') {
    const nested = normalizePaymentError(record.error, '');
    if (nested) return nested;
  }
  if (Array.isArray(record.issues)) {
    const issues = normalizePaymentError(record.issues, '');
    if (issues) return issues;
  }
  if (record.fieldErrors && typeof record.fieldErrors === 'object') {
    const fields = Object.entries(record.fieldErrors as Record<string, unknown>)
      .flatMap(([field, messages]) => {
        const message = normalizePaymentError(messages, '');
        return message ? [`${field}: ${message}`] : [];
      });
    if (fields.length) return fields.join(' ');
  }
  if (Array.isArray(record.formErrors)) {
    const formErrors = normalizePaymentError(record.formErrors, '');
    if (formErrors) return formErrors;
  }
  return fallback;
}
