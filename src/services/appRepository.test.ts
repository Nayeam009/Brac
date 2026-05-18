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
    const selectQuery = {
      eq: vi.fn(function (this: unknown) { return this; }),
      then: (resolve: (value: { data: unknown[]; error: null }) => void) => Promise.resolve(resolve({ data: [], error: null })),
    };
    databaseFrom.mockReturnValue({
      select: () => selectQuery,
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
    expect(selectQuery.eq).toHaveBeenCalledWith("patient_id", "patient-1");
    expect(selectQuery.eq).toHaveBeenCalledWith("stage", "2M");
    expect(upsertedRows[0][0]).toMatchObject({
      due_date: "2026-03-14",
      microscopy_result: "Negative",
      gene_xpert_result: "N - MTB Not Detected",
      created_at: "2026-03-15T00:00:00.000Z",
    });
  });

  it("upserts DOT rows by patient and date when the cloud already has that day", async () => {
    const { saveDotEntry } = await import("./appRepository");
    const upsertedRows: unknown[][] = [];
    const selectQuery = {
      eq: vi.fn(function (this: unknown) { return this; }),
      then: (resolve: (value: { data: unknown[]; error: null }) => void) => Promise.resolve(resolve({ data: [{ id: "dot-existing" }], error: null })),
    };
    databaseFrom.mockReturnValue({
      select: () => selectQuery,
      upsert: (rows: unknown[]) => {
        upsertedRows.push(rows);
        return {
          select: () => ({
            single: () => Promise.resolve({ data: rows[0], error: null }),
          }),
        };
      },
    });

    await saveDotEntry({
      id: "dot-local-newer",
      patientId: "patient-1",
      date: "2026-05-15",
      monthKey: "2026-05",
      day: 15,
      status: "done",
      updatedAt: "2026-05-15T08:00:00.000Z",
    });

    expect(selectQuery.eq).toHaveBeenCalledWith("patient_id", "patient-1");
    expect(selectQuery.eq).toHaveBeenCalledWith("date", "2026-05-15");
    expect(upsertedRows[0][0]).toMatchObject({ id: "dot-existing", patient_id: "patient-1", date: "2026-05-15" });
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

  it("deletes a lab result row by id", async () => {
    const { deleteLabResult } = await import("./appRepository");
    const eq = vi.fn().mockResolvedValue({ error: null });
    databaseFrom.mockReturnValue({
      delete: () => ({ eq }),
    });

    await deleteLabResult("lab-1");

    expect(databaseFrom).toHaveBeenCalledWith("lab_results");
    expect(eq).toHaveBeenCalledWith("id", "lab-1");
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

  it("scopes loaded patient-linked data to the current Field Officer", async () => {
    const { scopeAppDataToProfile } = await import("./appRepository");
    const scoped = scopeAppDataToProfile({
      patients: [
        { id: "patient-1", name: "Own", ownerId: "user-1", createdAt: "2026-05-15T00:00:00.000Z", updatedAt: "2026-05-15T00:00:00.000Z" },
      ],
      labResults: [
        { id: "lab-own", patientId: "patient-1", testType: "GeneXpert", createdAt: "2026-05-15T00:00:00.000Z", updatedAt: "2026-05-15T00:00:00.000Z" },
        { id: "lab-other", patientId: "patient-other", testType: "GeneXpert", createdAt: "2026-05-15T00:00:00.000Z", updatedAt: "2026-05-15T00:00:00.000Z" },
      ],
      dotEntries: [
        { id: "dot-own", patientId: "patient-1", date: "2026-05-15", monthKey: "2026-05", day: 15, status: "done", updatedAt: "2026-05-15T00:00:00.000Z" },
        { id: "dot-other", patientId: "patient-other", date: "2026-05-15", monthKey: "2026-05", day: 15, status: "done", updatedAt: "2026-05-15T00:00:00.000Z" },
      ],
      contacts: [
        { id: "contact-own", patientId: "patient-1", name: "Own contact", createdAt: "2026-05-15T00:00:00.000Z", updatedAt: "2026-05-15T00:00:00.000Z" },
        { id: "contact-other", patientId: "patient-other", name: "Other contact", createdAt: "2026-05-15T00:00:00.000Z", updatedAt: "2026-05-15T00:00:00.000Z" },
      ],
      tptRecords: [
        { id: "tpt-own", contactId: "contact-own", name: "Own TPT", status: "Active", createdAt: "2026-05-15T00:00:00.000Z", updatedAt: "2026-05-15T00:00:00.000Z" },
        { id: "tpt-other", contactId: "contact-other", name: "Other TPT", status: "Active", createdAt: "2026-05-15T00:00:00.000Z", updatedAt: "2026-05-15T00:00:00.000Z" },
      ],
      sputumFollowUps: [
        { id: "sp-own", patientId: "patient-1", stage: "2M", createdAt: "2026-05-15T00:00:00.000Z", updatedAt: "2026-05-15T00:00:00.000Z" },
        { id: "sp-other", patientId: "patient-other", stage: "2M", createdAt: "2026-05-15T00:00:00.000Z", updatedAt: "2026-05-15T00:00:00.000Z" },
      ],
      diaryEntries: [
        { id: "dia-own", date: "2026-05-15", time: "2026-05-15T00:00:00.000Z", type: "Record Updated", patientId: "patient-1", details: "Own", userId: "user-1" },
        { id: "dia-other", date: "2026-05-15", time: "2026-05-15T00:00:00.000Z", type: "Record Updated", patientId: "patient-other", details: "Other", userId: "user-other" },
        { id: "dia-report", date: "2026-05-15", time: "2026-05-15T00:00:00.000Z", type: "Report Generated", details: "Report", userId: "user-1" },
      ],
      tasks: [
        { id: "task-own", patientId: "patient-1", type: "DOT_NOT_UPDATED", title: "Own", priority: "High", status: "Open", createdAt: "2026-05-15T00:00:00.000Z" },
        { id: "task-other", patientId: "patient-other", type: "DOT_NOT_UPDATED", title: "Other", priority: "High", status: "Open", createdAt: "2026-05-15T00:00:00.000Z" },
      ],
      providers: [
        { id: "provider-shared", name: "Shared SS", type: "SS", createdAt: "2026-05-15T00:00:00.000Z", updatedAt: "2026-05-15T00:00:00.000Z" },
      ],
      attachments: [
        { id: "att-own", recordType: "patient", recordId: "patient-1", fileName: "own.pdf", fileSize: 1, bucket: "record-attachments", storageKey: "user-1/patient-1/own.pdf", url: "https://example/own.pdf", uploadedBy: "user-1", createdAt: "2026-05-15T00:00:00.000Z" },
        { id: "att-other", recordType: "patient", recordId: "patient-other", fileName: "other.pdf", fileSize: 1, bucket: "record-attachments", storageKey: "user-other/patient-other/other.pdf", url: "https://example/other.pdf", uploadedBy: "user-other", createdAt: "2026-05-15T00:00:00.000Z" },
      ],
    }, { profile });

    expect(scoped.labResults.map((item) => item.id)).toEqual(["lab-own"]);
    expect(scoped.dotEntries.map((item) => item.id)).toEqual(["dot-own"]);
    expect(scoped.contacts.map((item) => item.id)).toEqual(["contact-own"]);
    expect(scoped.tptRecords.map((item) => item.id)).toEqual(["tpt-own"]);
    expect(scoped.sputumFollowUps.map((item) => item.id)).toEqual(["sp-own"]);
    expect(scoped.diaryEntries.map((item) => item.id)).toEqual(["dia-own", "dia-report"]);
    expect(scoped.tasks.map((item) => item.id)).toEqual(["task-own"]);
    expect(scoped.attachments.map((item) => item.id)).toEqual(["att-own"]);
    expect(scoped.providers.map((item) => item.id)).toEqual(["provider-shared"]);
  });
});
