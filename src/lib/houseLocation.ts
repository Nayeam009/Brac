export type PatientHouseLocation = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  capturedAt: string;
  capturedBy?: string;
  source: "gps" | "manual";
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

export const isValidLatitude = (value: number) => Number.isFinite(value) && value >= -90 && value <= 90;
export const isValidLongitude = (value: number) => Number.isFinite(value) && value >= -180 && value <= 180;

export function getPatientHouseLocation(metadata?: Record<string, unknown>): PatientHouseLocation | undefined {
  const value = metadata?.houseLocation;
  if (!isRecord(value)) return undefined;

  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) return undefined;

  const accuracyMeters = Number(value.accuracyMeters);
  return {
    latitude,
    longitude,
    accuracyMeters: Number.isFinite(accuracyMeters) && accuracyMeters >= 0 ? accuracyMeters : undefined,
    capturedAt: typeof value.capturedAt === "string" ? value.capturedAt : "",
    capturedBy: typeof value.capturedBy === "string" ? value.capturedBy : undefined,
    source: value.source === "manual" ? "manual" : "gps",
  };
}

export function withPatientHouseLocation(metadata: Record<string, unknown> | undefined, location: PatientHouseLocation) {
  return { ...(metadata || {}), houseLocation: location };
}

export function withoutPatientHouseLocation(metadata: Record<string, unknown> | undefined) {
  const next = { ...(metadata || {}) };
  delete next.houseLocation;
  return next;
}

type ParsedHouseLocation = { latitude: number; longitude: number } | { error: string };

export function parseHouseLocationInput(latitudeText: string, longitudeText: string): ParsedHouseLocation {
  const latitude = Number(latitudeText.trim());
  const longitude = Number(longitudeText.trim());

  if (!latitudeText.trim() || !longitudeText.trim()) return { error: "Latitude and longitude are required." };
  if (!isValidLatitude(latitude)) return { error: "Latitude must be between -90 and 90." };
  if (!isValidLongitude(longitude)) return { error: "Longitude must be between -180 and 180." };
  return { latitude, longitude };
}

export function buildGoogleMapsPointUrl(location: Pick<PatientHouseLocation, "latitude" | "longitude">) {
  return `https://www.google.com/maps?q=${location.latitude},${location.longitude}`;
}

export function buildGoogleMapsDirectionsUrl(location: Pick<PatientHouseLocation, "latitude" | "longitude">) {
  return `https://www.google.com/maps/dir/?api=1&destination=${location.latitude},${location.longitude}`;
}

export function formatHouseCoordinates(location: Pick<PatientHouseLocation, "latitude" | "longitude">) {
  return `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`;
}

export function formatLocationAccuracy(accuracyMeters?: number) {
  if (accuracyMeters === undefined) return "";
  return `+/-${Math.round(accuracyMeters)} m`;
}
