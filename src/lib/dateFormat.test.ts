import { describe, expect, it } from "vitest";
import { formatDateDisplay, formatDateTimeDisplay, formatTimeDisplay, parseDateInput, isValidDateInput } from "./dateFormat";

describe("formatDateDisplay", () => {
  it("converts ISO yyyy-mm-dd to dd/mm/yyyy", () => {
    expect(formatDateDisplay("2026-09-05")).toBe("05/09/2026");
    expect(formatDateDisplay("2026-12-31")).toBe("31/12/2026");
    expect(formatDateDisplay("2026-01-01")).toBe("01/01/2026");
  });

  it("handles full ISO timestamps", () => {
    expect(formatDateDisplay("2026-09-05T14:30:00.000Z")).toBe("05/09/2026");
  });

  it("returns empty for null/undefined/empty", () => {
    expect(formatDateDisplay("")).toBe("");
    expect(formatDateDisplay(null)).toBe("");
    expect(formatDateDisplay(undefined)).toBe("");
  });
});

describe("formatTimeDisplay", () => {
  it("formats local times as compact lowercase 12-hour time", () => {
    expect(formatTimeDisplay("2026-05-13T00:00:00")).toBe("12:00am");
    expect(formatTimeDisplay("2026-05-13T12:00:00")).toBe("12:00pm");
    expect(formatTimeDisplay("2026-05-13T09:30:00")).toBe("9:30am");
    expect(formatTimeDisplay("2026-05-13T23:05:00")).toBe("11:05pm");
  });

  it("returns empty for null/undefined/empty", () => {
    expect(formatTimeDisplay("")).toBe("");
    expect(formatTimeDisplay(null)).toBe("");
    expect(formatTimeDisplay(undefined)).toBe("");
  });
});

describe("formatDateTimeDisplay", () => {
  it("formats local timestamps as dd/mm/yyyy h:mmam", () => {
    expect(formatDateTimeDisplay("2026-05-15T09:30:00")).toBe("15/05/2026 9:30am");
    expect(formatDateTimeDisplay("2026-05-15T12:00:00")).toBe("15/05/2026 12:00pm");
  });
});

describe("parseDateInput", () => {
  it("parses valid dd/mm/yyyy to ISO", () => {
    expect(parseDateInput("05/09/2026")).toBe("2026-09-05");
    expect(parseDateInput("31/12/2026")).toBe("2026-12-31");
    expect(parseDateInput("01/01/2026")).toBe("2026-01-01");
  });

  it("rejects invalid dates", () => {
    expect(parseDateInput("32/01/2026")).toBe("");  // day > 31
    expect(parseDateInput("00/01/2026")).toBe("");  // day 0
    expect(parseDateInput("15/13/2026")).toBe("");  // month > 12
    expect(parseDateInput("31/02/2026")).toBe("");  // Feb 31
    expect(parseDateInput("29/02/2025")).toBe("");  // not a leap year
  });

  it("accepts leap year", () => {
    expect(parseDateInput("29/02/2028")).toBe("2028-02-29");
  });

  it("rejects ambiguous/wrong formats", () => {
    expect(parseDateInput("2026-09-05")).toBe("");  // ISO not accepted
    expect(parseDateInput("abc")).toBe("");
    expect(parseDateInput("")).toBe("");
  });

  it("accepts two-digit year shorthand as 20yy for fast field entry", () => {
    expect(parseDateInput("09/05/26")).toBe("2026-05-09");
  });
});

describe("isValidDateInput", () => {
  it("empty is valid (optional fields)", () => {
    expect(isValidDateInput("")).toBe(true);
    expect(isValidDateInput("  ")).toBe(true);
  });

  it("valid dates pass", () => {
    expect(isValidDateInput("05/09/2026")).toBe(true);
    expect(isValidDateInput("31/12/2026")).toBe(true);
  });

  it("invalid dates fail", () => {
    expect(isValidDateInput("31/02/2026")).toBe(false);
    expect(isValidDateInput("abc")).toBe(false);
  });
});
