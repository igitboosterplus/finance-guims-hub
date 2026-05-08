import { describe, expect, it } from "vitest";
import {
  getTransactionTimestamp,
  isSameCalendarDate,
  normalizeDateOnlyValue,
  normalizeTransactionDate,
  toCalendarDateKey,
  transactionDateToInputValue,
} from "@/lib/transactionDates";

describe("transactionDates", () => {
  it("normalizes date-only transaction inputs to ISO", () => {
    const fallback = new Date(2026, 4, 8, 14, 30, 45, 120);
    const normalized = normalizeTransactionDate("2026-05-10", fallback);

    expect(normalized).toBe(new Date(2026, 4, 10, 14, 30, 45, 120).toISOString());
  });

  it("extracts a stable calendar date key from ISO strings", () => {
    expect(toCalendarDateKey("2026-05-10T15:12:00.000Z")).toBeTruthy();
    expect(toCalendarDateKey("2026-05-10")).toBe("2026-05-10");
    expect(toCalendarDateKey("invalid-date")).toBeNull();
  });

  it("normalizes any parseable date to a date-only value", () => {
    expect(normalizeDateOnlyValue("2026-05-10T08:15:30.000Z")).toMatch(/^2026-05-\d{2}$/);
    expect(normalizeDateOnlyValue("2026-05-10")).toBe("2026-05-10");
  });

  it("compares mixed date formats by calendar day", () => {
    expect(isSameCalendarDate("2026-05-10", "2026-05-10T09:10:00.000Z")).toBe(true);
    expect(isSameCalendarDate("2026-05-10", "2026-05-11T00:00:00.000Z")).toBe(false);
  });

  it("converts normalized transaction values back to input date format", () => {
    const inputDate = transactionDateToInputValue("2026-05-10T10:45:00.000Z");
    expect(inputDate).toMatch(/^2026-05-\d{2}$/);
  });

  it("returns local-midnight timestamp for date-only values", () => {
    const ts = getTransactionTimestamp("2026-05-10");
    expect(ts).toBe(new Date(2026, 4, 10, 0, 0, 0, 0).getTime());
  });
});
