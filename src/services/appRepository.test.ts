import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "../domain/types";

const upload = vi.fn();
const download = vi.fn();
const remove = vi.fn();
const storageFrom = vi.fn();
const databaseFrom = vi.fn();

vi.mock("../lib/insforgeClient", () => ({
  default: {
    storage: {
      from: storageFrom,
    },
    database: {
      from: databaseFrom,
    },
  },
}));

const profile: Profile = {
  id: "profile-1",
  userId: "user-1",
  email: "fo@example.com",
  role: "fo",
  status: "active",
  createdAt: "2026-05-15T00:00:00.000Z",
  updatedAt: "2026-05-15T00:00:00.000Z",
};

describe("attachment repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageFrom.mockReturnValue({ upload, download, remove });
  });

  it("uploads a file to InsForge Storage and stores its key and url", async () => {
    const { uploadRecordAttachment } = await import("./appRepository");
    const insertedRows: unknown[][] = [];
    const uploadedAt = "2026-05-15T08:00:00.000Z";
    upload.mockResolvedValue({
      data: {
        bucket: "record-attachments",
        key: "user-1/patient-1/report-form.pdf",
        size: 11,
        mimeType: "application/pdf",
        uploadedAt,
        url: "https://storage.example/record-attachments/user-1/patient-1/report-form.pdf",
      },
      error: null,
    });
    databaseFrom.mockReturnValue({
      upsert: (rows: unknown[]) => {
        insertedRows.push(rows);
        return {
          select: () => ({
            single: () =>
              Promise.resolve({
                data: { ...(rows[0] as object), id: "att-1", created_at: uploadedAt },
                error: null,
              }),
          }),
        };
      },
    });

    const file = new File(["hello world"], "Report Form.pdf", { type: "application/pdf" });
    const attachment = await uploadRecordAttachment({ patientId: "patient-1", file, profile });

    expect(storageFrom).toHaveBeenCalledWith("record-attachments");
    expect(upload).toHaveBeenCalledWith(expect.stringMatching(/^user-1\/patient-1\/.+-report-form\.pdf$/), file);
    expect(databaseFrom).toHaveBeenCalledWith("record_attachments");
    expect(insertedRows[0][0]).toMatchObject({
      record_type: "patient",
      record_id: "patient-1",
      file_name: "Report Form.pdf",
      file_type: "application/pdf",
      file_size: 11,
      bucket: "record-attachments",
      storage_key: "user-1/patient-1/report-form.pdf",
      url: "https://storage.example/record-attachments/user-1/patient-1/report-form.pdf",
      uploaded_by: "user-1",
    });
    expect(attachment).toMatchObject({
      id: "att-1",
      recordId: "patient-1",
      fileName: "Report Form.pdf",
      storageKey: "user-1/patient-1/report-form.pdf",
    });
  });

  it("saves the full sputum follow-up payload expected by the patient form", async () => {
    const { saveSputumFollowUp } = await import("./appRepository");
    const upsertedRows: unknown[][] = [];
    databaseFrom.mockReturnValue({
      upsert: (rows: unknown[]) => {
        upsertedRows.push(rows);
        return {
          select: () => ({
            single: () => Promise.resolve({ data: rows[0], error: null }),
          }),
        };
      },
    });

    await saveSputumFollowUp({
      id: "sp-1",
      patientId: "patient-1",
      stage: "2M",
      dueDate: "2026-03-14",
      testDate: "2026-03-15",
      labId: "LAB-2M",
      microscopyResult: "Negative",
      geneXpertResult: "N - MTB Not Detected",
      xpertTruenat: "N - MTB Not Detected",
      culture: "No growth",
      weightKg: 51,
      comment: "Good response",
      createdAt: "2026-03-15T00:00:00.000Z",
      updatedAt: "2026-03-15T00:00:00.000Z",
    });

    expect(databaseFrom).toHaveBeenCalledWith("sputum_followups");
    expect(upsertedRows[0][0]).toMatchObject({
      due_date: "2026-03-14",
      microscopy_result: "Negative",
      gene_xpert_result: "N - MTB Not Detected",
      created_at: "2026-03-15T00:00:00.000Z",
    });
  });

  it("removes patient attachment objects before deleting the patient row", async () => {
    const { deletePatientWithCleanup } = await import("./appRepository");
    const eq = vi.fn().mockResolvedValue({ error: null });
    remove.mockResolvedValue({ data: { path: "user-1/patient-1/xray-report.pdf" }, error: null });
    databaseFrom.mockReturnValue({
      delete: () => ({ eq }),
    });

    const result = await deletePatientWithCleanup("patient-1", [
      {
        id: "att-1",
        recordType: "patient",
        recordId: "patient-1",
        fileName: "xray-report.pdf",
        fileSize: 2048,
        bucket: "record-attachments",
        storageKey: "user-1/patient-1/xray-report.pdf",
        url: "https://storage.example/xray-report.pdf",
        uploadedBy: "user-1",
        createdAt: "2026-05-15T00:00:00.000Z",
      },
    ]);

    expect(storageFrom).toHaveBeenCalledWith("record-attachments");
    expect(remove).toHaveBeenCalledWith("user-1/patient-1/xray-report.pdf");
    expect(databaseFrom).toHaveBeenCalledWith("patients");
    expect(eq).toHaveBeenCalledWith("id", "patient-1");
    expect(result).toEqual({ removedFiles: 1, failedFiles: [] });
  });

  it("restores backup records through table upserts", async () => {
    const { restoreAppData } = await import("./appRepository");
    const calls: { table: string; rows: unknown[] }[] = [];
    databaseFrom.mockImplementation((table: string) => ({
      upsert: (rows: unknown[]) => {
        calls.push({ table, rows });
        return {
          select: () => ({
            single: () => Promise.resolve({ data: rows[0], error: null }),
          }),
        };
      },
    }));

    await restoreAppData({
      patients: [{
        id: "patient-1",
        name: "Amina",
        ownerId: "user-1",
        createdAt: "2026-05-15T00:00:00.000Z",
        updatedAt: "2026-05-15T00:00:00.000Z",
      }],
      labResults: [{
        id: "lab-1",
        patientId: "patient-1",
        testType: "GeneXpert",
        result: "Negative",
        createdAt: "2026-05-15T00:00:00.000Z",
        updatedAt: "2026-05-15T00:00:00.000Z",
      }],
      dotEntries: [],
      contacts: [],
      tptRecords: [],
      sputumFollowUps: [],
      diaryEntries: [],
      tasks: [],
      providers: [],
      attachments: [],
    }, { profile });

    expect(calls.map((call) => call.table)).toEqual(expect.arrayContaining(["patients", "lab_results"]));
    expect(calls.find((call) => call.table === "patients")?.rows[0]).toMatchObject({ owner_id: "user-1" });
  });
});
