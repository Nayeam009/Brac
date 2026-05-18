import { describe, expect, it } from "vitest";
import type { AppData } from "./appRepository";
import { mergeBackupData, parseBackupData } from "./backupService";

const emptyData = (): AppData => ({
  patients: [],
  labResults: [],
  dotEntries: [],
  contacts: [],
  tptRecords: [],
  sputumFollowUps: [],
  diaryEntries: [],
  tasks: [],
  providers: [],
  attachments: [],
});

describe("backup restore helpers", () => {
  it("rejects invalid backup files", () => {
    expect(() => parseBackupData({ diaryEntries: [] })).toThrow("Invalid backup file format.");
  });

  it("merge/upserts records by id and keeps existing records", () => {
    const current = emptyData();
    current.patients = [
      { id: "pat-1", name: "Old Name", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
      { id: "pat-2", name: "Existing", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
    ];

    const incoming = parseBackupData({
      patients: [
        { id: "pat-1", name: "Updated Name", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-02-01T00:00:00.000Z" },
        { id: "pat-3", name: "Imported", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-02-01T00:00:00.000Z" },
      ],
      diaryEntries: [],
    });

    const result = mergeBackupData(current, incoming, "user-1");

    expect(result.data.patients.map((patient) => patient.id)).toEqual(["pat-3", "pat-1", "pat-2"]);
    expect(result.data.patients.find((patient) => patient.id === "pat-1")?.name).toBe("Updated Name");
  });

  it("keeps only attachment metadata owned by the current FO", () => {
    const incoming = parseBackupData({
      patients: [{ id: "pat-1", name: "Amina", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }],
      attachments: [
        { id: "att-1", recordType: "patient", recordId: "pat-1", fileName: "own.pdf", fileSize: 1, bucket: "record-attachments", storageKey: "user-1/pat-1/own.pdf", url: "https://example/own.pdf", uploadedBy: "user-1", createdAt: "2026-01-01T00:00:00.000Z" },
        { id: "att-2", recordType: "patient", recordId: "pat-1", fileName: "other.pdf", fileSize: 1, bucket: "record-attachments", storageKey: "other/pat-1/other.pdf", url: "https://example/other.pdf", uploadedBy: "other", createdAt: "2026-01-01T00:00:00.000Z" },
      ],
      diaryEntries: [],
    });

    const result = mergeBackupData(emptyData(), incoming, "user-1");

    expect(result.data.attachments.map((attachment) => attachment.id)).toEqual(["att-1"]);
    expect(result.warnings).toContain("Skipped 1 attachment metadata record from another Field Officer.");
  });

  it("reassigns imported patient owner ids to the current FO before sync", () => {
    const incoming = parseBackupData({
      patients: [
        { id: "pat-1", name: "Imported", ownerId: "other-user", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
        { id: "pat-2", name: "No Owner", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
      ],
    });

    const result = mergeBackupData(emptyData(), incoming, "user-1");

    expect(result.data.patients.map((patient) => [patient.id, patient.ownerId])).toEqual([
      ["pat-1", "user-1"],
      ["pat-2", "user-1"],
    ]);
    expect(result.warnings).toContain("Reassigned 1 imported patient record to the current Field Officer for safe sync.");
  });
});
