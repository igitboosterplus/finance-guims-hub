import { dateInputToIsoTimestamp, formatLocalDateInputValue } from "@/lib/utils";

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDateOnlyKey(raw: string): string | null {
  if (!DATE_ONLY_RE.test(raw)) return null;
  const [year, month, day] = raw.split("-").map(Number);
  const d = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return null;
  }
  return raw;
}

function toValidDateOrNull(value: string): Date | null {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isDateOnlyValue(value: string): boolean {
  return DATE_ONLY_RE.test(value);
}

export function toCalendarDateKey(value: string): string | null {
  const raw = value?.trim();
  if (!raw) return null;

  const direct = parseDateOnlyKey(raw);
  if (direct) return direct;

  const parsed = toValidDateOrNull(raw);
  return parsed ? formatLocalDateInputValue(parsed) : null;
}

export function normalizeDateOnlyValue(value: string, fallback = new Date()): string {
  return toCalendarDateKey(value) ?? formatLocalDateInputValue(fallback);
}

export function isSameCalendarDate(a: string, b: string): boolean {
  const ka = toCalendarDateKey(a);
  const kb = toCalendarDateKey(b);
  return ka !== null && kb !== null && ka === kb;
}

export function isOnOrAfterCalendarDate(value: string, minimum: string | Date): boolean {
  const currentKey = toCalendarDateKey(value);
  const minimumKey = typeof minimum === 'string'
    ? toCalendarDateKey(minimum)
    : formatLocalDateInputValue(minimum);

  return currentKey !== null && minimumKey !== null && currentKey >= minimumKey;
}

export function normalizeTransactionDate(value: string, fallback = new Date()): string {
  const raw = value?.trim();
  if (!raw) return fallback.toISOString();

  const dateOnlyKey = parseDateOnlyKey(raw);
  if (dateOnlyKey) {
    return dateInputToIsoTimestamp(dateOnlyKey, fallback);
  }

  const parsed = toValidDateOrNull(raw);
  return parsed ? parsed.toISOString() : fallback.toISOString();
}

export function getTransactionTimestamp(value: string, fallback = new Date()): number {
  const raw = value?.trim();
  if (!raw) return fallback.getTime();

  const dateOnlyKey = parseDateOnlyKey(raw);
  if (dateOnlyKey) {
    const [year, month, day] = dateOnlyKey.split("-").map(Number);
    return new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
  }

  const parsed = toValidDateOrNull(raw);
  return parsed ? parsed.getTime() : fallback.getTime();
}

export function transactionDateToInputValue(value: string, fallback = new Date()): string {
  return normalizeDateOnlyValue(value, fallback);
}
