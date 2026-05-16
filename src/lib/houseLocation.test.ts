import { describe, expect, it } from "vitest";
import { buildGoogleMapsDirectionsUrl, buildGoogleMapsPointUrl, formatHouseCoordinates, getPatientHouseLocation, parseHouseLocationInput, withoutPatientHouseLocation, withPatientHouseLocation } from "./houseLocation";

describe("house location helpers", () => {
  const location = {
    latitude: 23.810331,
    longitude: 90.412521,
    accuracyMeters: 14,
    capturedAt: "2026-05-16T10:00:00.000Z",
    source: "gps" as const,
  };

  it("reads, writes, clears and formats a patient house location", () => {
    const metadata = withPatientHouseLocation({ clinical: { hivStatus: "Negative" } }, location);

    expect(getPatientHouseLocation(metadata)).toEqual(location);
    expect(formatHouseCoordinates(location)).toBe("23.810331, 90.412521");
    expect(withoutPatientHouseLocation(metadata)).toEqual({ clinical: { hivStatus: "Negative" } });
  });

  it("validates manual coordinate input and builds Google Maps links", () => {
    expect(parseHouseLocationInput("23.810331", "90.412521")).toEqual({ latitude: 23.810331, longitude: 90.412521 });
    expect(parseHouseLocationInput("91", "90.412521")).toEqual({ error: "Latitude must be between -90 and 90." });
    expect(buildGoogleMapsPointUrl(location)).toBe("https://www.google.com/maps?q=23.810331,90.412521");
    expect(buildGoogleMapsDirectionsUrl(location)).toBe("https://www.google.com/maps/dir/?api=1&destination=23.810331,90.412521");
  });
});
