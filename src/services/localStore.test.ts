import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppData } from "./appRepository";
import { enqueueSync, loadLocalAppData, loadPendingAttachmentBlob, loadSyncQueue, mergeAppDataByFreshness, saveLocalAppData, savePendingAttachmentBlob } from "./localStore";

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

describe("local-first store", () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    vi.stubGlobal("indexedDB", undefined);
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      removeItem: vi.fn((key: string) => storage.delete(key)),
      clear: vi.fn(() => storage.clear()),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists a full local app snapshot by profile", async () => {
    const data = emptyData();
    data.patients = [{ id: "pat-1", name: "Local Patient", createdAt: "2026-05-15T00:00:00.000Z", updatedAt: "2026-05-15T00:00:00.000Z" }];

    await saveLocalAppData("user-1", data);

    expect(await loadLocalAppData("user-1")).toMatchObject({ patients: [{ id: "pat-1", name: "Local Patient" }] });
  });

  it("coalesces repeated upserts and keeps the newest payload", async () => {
    await enqueueSync("user-1", { entity: "patient", operation: "upsert", entityKey: "pat-1", payload: { id: "pat-1", name: "Old" } });
    await enqueueSync("user-1", { entity: "patient", operation: "upsert", entityKey: "pat-1", payload: { id: "pat-1", name: "New" } });

    const queue = await loadSyncQueue("user-1");

    expect(queue).toHaveLength(1);
    expect(queue[0].payload).toMatchObject({ name: "New" });
  });

  it("keeps a pending attachment file locally until upload retry succeeds", async () => {
    const file = new File(["xray"], "xray.pdf", { type: "application/pdf" });

    await savePendingAttachmentBlob("user-1", "att-1", file);

    const restored = await loadPendingAttachmentBlob("user-1", "att-1");
    expect(restored?.name).toBe("xray.pdf");
    expect(await restored?.text()).toBe("xray");
  });

  it("merges local and cloud data without overwriting newer local rows", () => {
    const local = emptyData();
    const cloud = emptyData();
    local.patients = [{ id: "pat-1", name: "Local Newer", createdAt: "2026-05-01T00:00:00.000Z", updatedAt: "2026-05-16T00:00:00.000Z" }];
    cloud.patients = [{ id: "pat-1", name: "Cloud Older", createdAt: "2026-05-01T00:00:00.000Z", updatedAt: "2026-05-15T00:00:00.000Z" }];
    local.dotEntries = [{ id: "dot-local", patientId: "pat-1", date: "2026-05-16", monthKey: "2026-05", day: 16, status: "done", updatedAt: "2026-05-16T00:00:00.000Z" }];
    cloud.dotEntries = [{ id: "dot-cloud", patientId: "pat-1", date: "2026-05-16", monthKey: "2026-05", day: 16, status: "missed", updatedAt: "2026-05-15T00:00:00.000Z" }];

    const merged = mergeAppDataByFreshness(local, cloud);

    expect(merged.patients[0].name).toBe("Local Newer");
    expect(merged.dotEntries[0].status).toBe("done");
  });
});
