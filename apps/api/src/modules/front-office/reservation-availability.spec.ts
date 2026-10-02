import { describe, expect, it } from "vitest";
import { assertValidStayDates, dateRangesOverlap } from "./reservation-availability";

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe("reservation availability", () => {
  it("detects overlapping stay dates", () => {
    expect(dateRangesOverlap(day("2026-09-02"), day("2026-09-05"), day("2026-09-04"), day("2026-09-07"))).toBe(true);
  });

  it("allows checkout and check-in on the same date", () => {
    expect(dateRangesOverlap(day("2026-09-05"), day("2026-09-08"), day("2026-09-02"), day("2026-09-05"))).toBe(false);
  });

  it("rejects same-day departure dates", () => {
    expect(() => assertValidStayDates(day("2026-09-05"), day("2026-09-05"))).toThrow("Departure date");
  });
});
