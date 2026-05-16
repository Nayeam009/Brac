import { describe, expect, it } from "vitest";
import { patientFromRow, patientToRow, recordAttachmentFromRow, recordAttachmentToRow, taskFromRow, taskToRow } from "./mappers";

describe("mappers", () => {
  it("maps patient rows between snake_case storage and camelCase domain fields", () => {
    const row = {
      id: "p1",
      dots_no: "DOT-7",
      etb_id: "ETB-1",
      registration_date: "2026-05-13",
      name: "Rahima",
      age: 31,
      metadata: {
        clinical: {
          hivStatus: "Negative",
          bcgScar: "Present",
        },
      },
      owner_id: "u1",
      created_at: "2026-05-13T10:00:00.000Z",
      updated_at: "2026-05-13T11:00:00.000Z",
    };

    expect(patientFromRow(row)).toMatchObject({
      id: "p1",
      dotsNo: "DOT-7",
      etbId: "ETB-1",
      registrationDate: "2026-05-13",
      metadata: {
        clinical: {
          hivStatus: "Negative",
          bcgScar: "Present",
        },
      },
      ownerId: "u1",
      createdAt: "2026-05-13T10:00:00.000Z",
      updatedAt: "2026-05-13T11:00:00.000Z",
    });

    expect(patientToRow(patientFromRow(row))).toMatchObject(row);
  });

  it("omits undefined values when mapping domain objects to rows", () => {
    expect(
      taskToRow({
        id: "task-1",
        type: "FOLLOWUP_DUE",
        title: "Follow-up due",
        priority: "High",
        status: "Open",
        createdAt: "2026-05-13T00:00:00.000Z",
      }),
    ).toEqual({
      id: "task-1",
      type: "FOLLOWUP_DUE",
      title: "Follow-up due",
      priority: "High",
      status: "Open",
      created_at: "2026-05-13T00:00:00.000Z",
    });
  });

  it("maps task rows between snake_case storage and camelCase domain fields", () => {
    expect(
      taskFromRow({
        id: "task-1",
        patient_id: "p1",
        type: "DOT_MISSED",
        title: "DOT missed",
        due_date: "2026-05-14",
        priority: "High",
        status: "Open",
        created_at: "2026-05-13T00:00:00.000Z",
        completed_at: null,
      }),
    ).toMatchObject({
      id: "task-1",
      patientId: "p1",
      dueDate: "2026-05-14",
      createdAt: "2026-05-13T00:00:00.000Z",
    });
  });

  it("maps record attachment rows and keeps the storage key and url", () => {
    const row = {
      id: "att-1",
      record_type: "patient",
      record_id: "p1",
      file_name: "xray.png",
      file_type: "image/png",
      file_size: 2048,
      bucket: "record-attachments",
      storage_key: "u1/p1/xray.png",
      url: "https://example.test/storage/xray.png",
      uploaded_by: "u1",
      created_at: "2026-05-15T00:00:00.000Z",
    };

    const attachment = recordAttachmentFromRow(row);

    expect(attachment).toMatchObject({
      recordType: "patient",
      recordId: "p1",
      storageKey: "u1/p1/xray.png",
      url: "https://example.test/storage/xray.png",
    });
    expect(recordAttachmentToRow(attachment)).toEqual(row);
  });
});
