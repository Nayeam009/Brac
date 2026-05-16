import type { AppData } from "./appRepository";

export type SyncEntity = "patient" | "lab" | "dot" | "sputum" | "contact" | "tpt" | "provider" | "diary" | "attachment" | "task";
export type SyncOperation = "upsert" | "delete" | "upload";

export type QueuedSyncItem = {
  id: string;
  profileId: string;
  entity: SyncEntity;
  operation: SyncOperation;
  entityKey: string;
  payload: unknown;
  blobKey?: string;
  attempts: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
};

export type QueuedSyncInput = Omit<QueuedSyncItem, "id" | "profileId" | "attempts" | "createdAt" | "updatedAt"> & {
  id?: string;
  attempts?: number;
};

const DB_NAME = "tb-fo-local-first";
const DB_VERSION = 1;
const SNAPSHOT_STORE = "snapshots";
const QUEUE_STORE = "syncQueue";
const BLOB_STORE = "attachmentBlobs";

const memoryBlobFallback = new Map<string, File>();

export const emptyAppData = (): AppData => ({
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

const nowIso = () => new Date().toISOString();
const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const canUseIndexedDb = () => typeof indexedDB !== "undefined";
const localDataKey = (profileId: string) => `tb-fo-local-data:${profileId}`;
const localQueueKey = (profileId: string) => `tb-fo-sync-queue:${profileId}`;
const blobFallbackKey = (profileId: string, blobKey: string) => `${profileId}:${blobKey}`;

const normalizeAppData = (data?: Partial<AppData> | null): AppData => ({
  ...emptyAppData(),
  ...(data || {}),
  patients: data?.patients || [],
  labResults: data?.labResults || [],
  dotEntries: data?.dotEntries || [],
  contacts: data?.contacts || [],
  tptRecords: data?.tptRecords || [],
  sputumFollowUps: data?.sputumFollowUps || [],
  diaryEntries: data?.diaryEntries || [],
  tasks: data?.tasks || [],
  providers: data?.providers || [],
  attachments: data?.attachments || [],
});

const requestToPromise = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed."));
  });

const transactionDone = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted."));
    transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed."));
  });

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    if (!canUseIndexedDb()) {
      reject(new Error("IndexedDB unavailable."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) db.createObjectStore(SNAPSHOT_STORE, { keyPath: "profileId" });
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        const queue = db.createObjectStore(QUEUE_STORE, { keyPath: "id" });
        queue.createIndex("profileId", "profileId", { unique: false });
      }
      if (!db.objectStoreNames.contains(BLOB_STORE)) {
        const blobs = db.createObjectStore(BLOB_STORE, { keyPath: "blobKey" });
        blobs.createIndex("profileId", "profileId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Unable to open local database."));
  });

async function withStore<T>(storeName: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => Promise<T>): Promise<T> {
  const db = await openDb();
  try {
    const tx = db.transaction(storeName, mode);
    const result = await action(tx.objectStore(storeName));
    await transactionDone(tx);
    return result;
  } finally {
    db.close();
  }
}

export async function loadLocalAppData(profileId: string): Promise<AppData | null> {
  if (canUseIndexedDb()) {
    try {
      const record = await withStore<{ data?: AppData } | undefined>(SNAPSHOT_STORE, "readonly", (store) =>
        requestToPromise(store.get(profileId)),
      );
      if (record?.data) return normalizeAppData(record.data);
    } catch {
      // Fall back to localStorage when IndexedDB is unavailable or blocked.
    }
  }

  try {
    const raw = localStorage.getItem(localDataKey(profileId));
    return raw ? normalizeAppData(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export async function saveLocalAppData(profileId: string, data: AppData): Promise<void> {
  const normalized = normalizeAppData(data);
  if (canUseIndexedDb()) {
    try {
      await withStore(SNAPSHOT_STORE, "readwrite", async (store) => {
        await requestToPromise(store.put({ profileId, data: normalized, updatedAt: nowIso() }));
      });
      return;
    } catch {
      // Fall through to localStorage fallback.
    }
  }

  localStorage.setItem(localDataKey(profileId), JSON.stringify(normalized));
}

export async function loadSyncQueue(profileId: string): Promise<QueuedSyncItem[]> {
  if (canUseIndexedDb()) {
    try {
      return await withStore<QueuedSyncItem[]>(QUEUE_STORE, "readonly", async (store) => {
        const index = store.index("profileId");
        return requestToPromise(index.getAll(profileId));
      });
    } catch {
      // Fall through to localStorage fallback.
    }
  }

  try {
    const raw = localStorage.getItem(localQueueKey(profileId));
    return raw ? JSON.parse(raw) as QueuedSyncItem[] : [];
  } catch {
    return [];
  }
}

async function saveSyncQueue(profileId: string, items: QueuedSyncItem[]): Promise<void> {
  const scoped = items.filter((item) => item.profileId === profileId);
  if (canUseIndexedDb()) {
    try {
      await withStore(QUEUE_STORE, "readwrite", async (store) => {
        const index = store.index("profileId");
        const existing = await requestToPromise(index.getAll(profileId));
        await Promise.all(existing.map((item) => requestToPromise(store.delete(item.id))));
        await Promise.all(scoped.map((item) => requestToPromise(store.put(item))));
      });
      return;
    } catch {
      // Fall through to localStorage fallback.
    }
  }

  localStorage.setItem(localQueueKey(profileId), JSON.stringify(scoped));
}

export async function enqueueSync(profileId: string, input: QueuedSyncInput): Promise<QueuedSyncItem> {
  const queue = await loadSyncQueue(profileId);
  const timestamp = nowIso();
  const existing = queue.find((item) =>
    item.entity === input.entity &&
    item.entityKey === input.entityKey &&
    item.operation === input.operation,
  );
  const nextItem: QueuedSyncItem = {
    id: existing?.id || input.id || uid("sync"),
    profileId,
    entity: input.entity,
    operation: input.operation,
    entityKey: input.entityKey,
    payload: input.payload,
    blobKey: input.blobKey,
    attempts: existing?.attempts || input.attempts || 0,
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
  };

  const nextQueue = queue
    .filter((item) => !(item.entity === input.entity && item.entityKey === input.entityKey && item.operation === input.operation))
    .filter((item) => !(input.operation === "delete" && item.entity === input.entity && item.entityKey === input.entityKey))
    .concat(nextItem);

  await saveSyncQueue(profileId, nextQueue);
  return nextItem;
}

export async function removeSyncedQueueItem(profileId: string, id: string): Promise<void> {
  const queue = await loadSyncQueue(profileId);
  await saveSyncQueue(profileId, queue.filter((item) => item.id !== id));
}

export async function markSyncItemFailed(profileId: string, id: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : "Unknown sync error.";
  const queue = await loadSyncQueue(profileId);
  await saveSyncQueue(profileId, queue.map((item) =>
    item.id === id ? { ...item, attempts: item.attempts + 1, lastError: message, updatedAt: nowIso() } : item,
  ));
}

export async function savePendingAttachmentBlob(profileId: string, blobKey: string, file: File): Promise<void> {
  if (canUseIndexedDb()) {
    try {
      await withStore(BLOB_STORE, "readwrite", async (store) => {
        await requestToPromise(store.put({ profileId, blobKey, file, updatedAt: nowIso() }));
      });
      return;
    } catch {
      // Fall through to in-memory fallback.
    }
  }
  memoryBlobFallback.set(blobFallbackKey(profileId, blobKey), file);
}

export async function loadPendingAttachmentBlob(profileId: string, blobKey: string): Promise<File | null> {
  if (canUseIndexedDb()) {
    try {
      const record = await withStore<{ file?: File } | undefined>(BLOB_STORE, "readonly", (store) =>
        requestToPromise(store.get(blobKey)),
      );
      if (record?.file) return record.file;
    } catch {
      // Fall through to in-memory fallback.
    }
  }
  return memoryBlobFallback.get(blobFallbackKey(profileId, blobKey)) || null;
}

export async function removePendingAttachmentBlob(profileId: string, blobKey: string): Promise<void> {
  if (canUseIndexedDb()) {
    try {
      await withStore(BLOB_STORE, "readwrite", async (store) => {
        await requestToPromise(store.delete(blobKey));
      });
    } catch {
      // Ignore and clear fallback too.
    }
  }
  memoryBlobFallback.delete(blobFallbackKey(profileId, blobKey));
}

export async function flushSyncQueue(profileId: string, syncOne: (item: QueuedSyncItem) => Promise<void>): Promise<{ synced: number; failed: number; pending: number }> {
  const queue = (await loadSyncQueue(profileId)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let synced = 0;
  let failed = 0;

  for (const item of queue) {
    try {
      await syncOne(item);
      await removeSyncedQueueItem(profileId, item.id);
      synced += 1;
    } catch (error) {
      await markSyncItemFailed(profileId, item.id, error);
      failed += 1;
    }
  }

  return { synced, failed, pending: (await loadSyncQueue(profileId)).length };
}

const freshness = (item: { updatedAt?: string; createdAt?: string; time?: string }) =>
  Date.parse(item.updatedAt || item.createdAt || item.time || "") || 0;

const mergeByKey = <T extends { updatedAt?: string; createdAt?: string; time?: string }>(
  local: T[],
  cloud: T[],
  keyFor: (item: T) => string,
) => {
  const map = new Map<string, T>();
  for (const item of cloud) map.set(keyFor(item), item);
  for (const item of local) {
    const key = keyFor(item);
    const current = map.get(key);
    if (!current || freshness(item) >= freshness(current)) map.set(key, item);
  }
  return Array.from(map.values()).sort((a, b) => freshness(b) - freshness(a));
};

export function mergeAppDataByFreshness(local: AppData | null | undefined, cloud: AppData | null | undefined): AppData {
  const localData = normalizeAppData(local);
  const cloudData = normalizeAppData(cloud);
  return {
    patients: mergeByKey(localData.patients, cloudData.patients, (item) => item.id),
    labResults: mergeByKey(localData.labResults, cloudData.labResults, (item) => item.id),
    dotEntries: mergeByKey(localData.dotEntries, cloudData.dotEntries, (item) => `${item.patientId}:${item.date}`),
    contacts: mergeByKey(localData.contacts, cloudData.contacts, (item) => item.id),
    tptRecords: mergeByKey(localData.tptRecords, cloudData.tptRecords, (item) => item.id),
    sputumFollowUps: mergeByKey(localData.sputumFollowUps, cloudData.sputumFollowUps, (item) => `${item.patientId}:${item.stage}`),
    diaryEntries: mergeByKey(localData.diaryEntries, cloudData.diaryEntries, (item) => item.id),
    tasks: mergeByKey(localData.tasks, cloudData.tasks, (item) => item.id),
    providers: mergeByKey(localData.providers, cloudData.providers, (item) => item.id),
    attachments: mergeByKey(localData.attachments, cloudData.attachments, (item) => item.id),
  };
}
