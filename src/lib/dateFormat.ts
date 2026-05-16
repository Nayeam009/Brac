/**
 * Central date formatting & parsing utility.
 *
 * User-facing format: dd/mm/yyyy  (day/month/year)
 * User-facing time: h:mmam / h:mmpm
 * Internal / API / DB format: yyyy-mm-dd  (ISO date)
 *
 * All conversions happen at the boundary: display & input only.
 */

const pad2 = (value: number) => String(value).padStart(2, "0");

const parseDateTime = (value: string): Date | null => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** Convert an ISO date string (yyyy-mm-dd or full ISO timestamp) to dd/mm/yyyy for user display. */
export function formatDateDisplay(isoDate: string | undefined | null): string {
  if (!isoDate) return "";
  const dateStr = isoDate.slice(0, 10); // extract yyyy-mm-dd
  const parts = dateStr.split("-");
  if (parts.length !== 3) return isoDate;
  const [y, m, d] = parts;
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}/${y}`;
}

/** Convert an ISO timestamp to compact local 12-hour time, e.g. 9:30am or 12:00pm. */
export function formatTimeDisplay(isoDateTime: string | undefined | null): string {
  if (!isoDateTime) return "";
  const date = parseDateTime(isoDateTime);
  if (!date) return isoDateTime;
  const hours = date.getHours();
  const suffix = hours >= 12 ? "pm" : "am";
  const hour12 = hours % 12 || 12;
  return `${hour12}:${pad2(date.getMinutes())}${suffix}`;
}

/** Convert an ISO timestamp to local dd/mm/yyyy h:mmam for user-facing history/audit display. */
export function formatDateTimeDisplay(isoDateTime: string | undefined | null): string {
  if (!isoDateTime) return "";
  const date = parseDateTime(isoDateTime);
  if (!date) return isoDateTime;
  const datePart = `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
  return `${datePart} ${formatTimeDisplay(isoDateTime)}`;
}

/** Convert a Date to the user's local calendar date in internal ISO yyyy-mm-dd shape. */
export function toLocalIsoDate(date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Convert a Date to local yyyy-mm month key for month-based UI controls. */
export function toLocalIsoMonth(date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

/** Parse a dd/mm/yyyy user input string to ISO yyyy-mm-dd. Returns "" if invalid. */
export function parseDateInput(value: string): string {
  if (!value) return "";
  const cleaned = value.trim();
  const parts = cleaned.split("/");
  if (parts.length !== 3) return "";
  const [dStr, mStr, rawYStr] = parts;
  const yStr = rawYStr.length === 2 ? `20${rawYStr}` : rawYStr;
  const d = Number(dStr);
  const m = Number(mStr);
  const y = Number(yStr);
  if (!d || !m || !y || (rawYStr.length !== 2 && rawYStr.length !== 4)) return "";
  if (m < 1 || m > 12) return "";
  if (d < 1 || d > 31) return "";
  // Validate the date is real (handles month lengths + leap years)
  const iso = `${yStr}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const date = new Date(`${iso}T00:00:00`);
  if (isNaN(date.getTime())) return "";
  if (date.getDate() !== d || date.getMonth() + 1 !== m || date.getFullYear() !== y) return "";
  return iso;
}

/** Validate a dd/mm/yyyy string. Empty is considered valid (for optional fields). */
export function isValidDateInput(value: string): boolean {
  if (!value || !value.trim()) return true;
  return parseDateInput(value) !== "";
}

/** Convert ISO date to dd/mm/yyyy for pre-filling an input. */
export function isoToDisplay(isoDate: string | undefined | null): string {
  return formatDateDisplay(isoDate);
}
