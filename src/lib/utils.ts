import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatLocalDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateInputToIsoTimestamp(dateInput: string, fallback = new Date()) {
  if (!dateInput) return fallback.toISOString();

  const [year, month, day] = dateInput.split("-").map(Number);
  if (!year || !month || !day) return fallback.toISOString();

  return new Date(
    year,
    month - 1,
    day,
    fallback.getHours(),
    fallback.getMinutes(),
    fallback.getSeconds(),
    fallback.getMilliseconds(),
  ).toISOString();
}
