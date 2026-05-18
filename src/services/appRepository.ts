import insforge from "../lib/insforgeClient";
import type {
  ContactPerson,
  DiaryEntry,
  DotEntry,
  LabResult,
  Patient,
  Profile,
  Provider,
  RecordAttachment,
  SputumFollowUp,
  Task,
  TptRecord,
} from "../domain/types";
import {
  contactFromRow,
  contactToRow,
  diaryEntryFromRow,
  diaryEntryToRow,
  dotEntryFromRow,
  dotEntryToRow,
  labResultFromRow,
  labResultToRow,
  patientFromRow,
  patientToRow,
  providerFromRow,
  providerToRow,
  recordAttachmentFromRow,
  recordAttachmentToRow,
  sputumFollowUpFromRow,
  sputumFollowUpToRow,
  taskFromRow,
  taskToRow,
  tptRecordFromRow,
  tptRecordToRow,
  type Row,
} from "./mappers";

export type AppData = {
  patients: Patient[];
  labResults: LabResult[];
  dotEntries: DotEntry[];
  contacts: ContactPerson[];
  tptRecords: TptRecord[];
  sputumFollowUps: SputumFollowUp[];
  diaryEntries: DiaryEntry[];
  tasks: Task[];
  providers: Provider[];
  attachments: RecordAttachment[];
};

export type RepositoryContext = {
  profile?: Profile | null;
};

const tables = {
  patients: "patients",
  labResults: "lab_results",
  dotEntries: "dot_entries",
  contacts: "contact_people",
  tptRecords: "tpt_records",
  sputumFollowUps: "sputum_followups",
  diaryEntries: "diary_entries",
  tasks: "tasks",
  providers: "providers",
  recordAttachments: "record_attachments",
} as const;

const attachmentBucket = "record-attachments";
const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

const safeFileName = (name: string): string => {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "attachment";
};

const toError = (error: unknown, fallback: string): Error => {
  if (error instanceof Error) return error;
  if (error && typeof error === "object" && "message" in error) {
    return new Error(String((error as { message: unknown }).message));
  }
  return new Error(fallback);
};

const ensureData = <T>(data: T | null, error: unknown, fallback: string): T => {
  if (error) throw toError(error, fallback);
  if (data === null) throw new Error(fallback);
  return data;
};

const selectAll = async <T>(table: string, mapper: (row: Row) => T, ownerId?: string): Promise<T[]> => {
  const query = insforge.database.from(table).select("*");
  const scopedQuery = ownerId && table === tables.patients ? query.eq("owner_id", ownerId) : query;
  const { data, error } = await scopedQuery;
  return ensureData(data as Row[] | null, error, `Unable to load ${table}.`).map(mapper);
};

const upsertOne = async <T>(table: string, row: Row, mapper: (row: Row) => T): Promise<T> => {
  const { data, error } = await insforge.database.from(table).upsert([row]).select("*").single();
  return mapper(ensureData(data as Row | null, error, `Unable to save ${table}.`));
};

const findOne = async (table: string, filters: Record<string, unknown>): Promise<Row | undefined> => {
  let query = insforge.database.from(table).select("*");
  for (const [key, filterValue] of Object.entries(filters)) query = query.eq(key, filterValue);
  const { data, error } = await query;
  if (error) throw toError(error, `Unable to load ${table}.`);
  return Array.isArray(data) ? data[0] as Row | undefined : data as Row | undefined;
};

export function scopeAppDataToProfile(data: AppData, context: RepositoryContext = {}): AppData {
  const userId = context.profile?.userId;
  if (!userId) return data;

  const patientIds = new Set(data.patients.map((patient) => patient.id));
  const contacts = data.contacts.filter((contact) => patientIds.has(contact.patientId));
  const contactIds = new Set(contacts.map((contact) => contact.id));

  return {
    ...data,
    labResults: data.labResults.filter((lab) => patientIds.has(lab.patientId)),
    dotEntries: data.dotEntries.filter((dot) => patientIds.has(dot.patientId)),
    contacts,
    tptRecords: data.tptRecords.filter((record) =>
      Boolean((record.patientId && patientIds.has(record.patientId)) || (record.contactId && contactIds.has(record.contactId))),
    ),
    sputumFollowUps: data.sputumFollowUps.filter((followUp) => patientIds.has(followUp.patientId)),
    diaryEntries: data.diaryEntries.filter((entry) =>
      entry.patientId ? patientIds.has(entry.patientId) : !entry.userId || entry.userId === userId,
    ),
    tasks: data.tasks.filter((task) => !task.patientId || patientIds.has(task.patientId)),
    attachments: data.attachments.filter((attachment) =>
      attachment.recordType === "patient" && patientIds.has(attachment.recordId) && (!attachment.uploadedBy || attachment.uploadedBy === userId),
    ),
  };
}

export async function loadAppData(context: RepositoryContext = {}): Promise<AppData> {
  const ownerId = context.profile?.userId;
  const [patients, labResults, dotEntries, contacts, tptRecords, sputumFollowUps, diaryEntries, tasks, providers, attachments] = await Promise.all([
    selectAll(tables.patients, patientFromRow, ownerId),
    selectAll(tables.labResults, labResultFromRow),
    selectAll(tables.dotEntries, dotEntryFromRow),
    selectAll(tables.contacts, contactFromRow),
    selectAll(tables.tptRecords, tptRecordFromRow),
    selectAll(tables.sputumFollowUps, sputumFollowUpFromRow),
    selectAll(tables.diaryEntries, diaryEntryFromRow),
    selectAll(tables.tasks, taskFromRow),
    selectAll(tables.providers, providerFromRow),
    selectAll(tables.recordAttachments, recordAttachmentFromRow),
  ]);

  return scopeAppDataToProfile({
    patients,
    labResults,
    dotEntries,
    contacts,
    tptRecords,
    sputumFollowUps,
    diaryEntries,
    tasks,
    providers,
    attachments,
  }, context);
}

export const savePatient = (patient: Patient): Promise<Patient> =>
  upsertOne(tables.patients, patientToRow(patient), patientFromRow);

export async function deletePatient(patientId: string): Promise<void> {
  const { error } = await insforge.database.from(tables.patients).delete().eq("id", patientId);
  if (error) throw toError(error, "Unable to delete patient.");
}

export async function deleteLabResult(labId: string): Promise<void> {
  const { error } = await insforge.database.from(tables.labResults).delete().eq("id", labId);
  if (error) throw toError(error, "Unable to delete lab result.");
}

export async function deletePatientWithCleanup(patientId: string, attachments: RecordAttachment[] = []): Promise<{ removedFiles: number; failedFiles: string[] }> {
  const patientAttachments = attachments.filter((attachment) => attachment.recordType === "patient" && attachment.recordId === patientId);
  const failedFiles: string[] = [];
  let removedFiles = 0;

  await deletePatient(patientId);

  for (const attachment of patientAttachments) {
    try {
      const { error } = await insforge.storage.from(attachment.bucket).remove(attachment.storageKey);
      if (error) throw toError(error, "Unable to remove attachment.");
      removedFiles += 1;
    } catch {
      failedFiles.push(attachment.fileName || attachment.storageKey);
    }
  }

  return { removedFiles, failedFiles };
}

export const saveLabResult = (lab: LabResult): Promise<LabResult> =>
  upsertOne(tables.labResults, labResultToRow(lab), labResultFromRow);

export async function saveDotEntry(dot: DotEntry): Promise<DotEntry> {
  const existing = await findOne(tables.dotEntries, { patient_id: dot.patientId, date: dot.date });
  const existingId = typeof existing?.id === "string" ? existing.id : "";
  return upsertOne(tables.dotEntries, dotEntryToRow({ ...dot, id: existingId || dot.id }), dotEntryFromRow);
}

export const saveContact = (contact: ContactPerson): Promise<ContactPerson> =>
  upsertOne(tables.contacts, contactToRow(contact), contactFromRow);

export const saveTptRecord = (tpt: TptRecord): Promise<TptRecord> =>
  upsertOne(tables.tptRecords, tptRecordToRow(tpt), tptRecordFromRow);

export const saveDiaryEntry = (entry: DiaryEntry): Promise<DiaryEntry> =>
  upsertOne(tables.diaryEntries, diaryEntryToRow(entry), diaryEntryFromRow);

export const saveTask = (task: Task): Promise<Task> => upsertOne(tables.tasks, taskToRow(task), taskFromRow);

export const saveProvider = (provider: Provider): Promise<Provider> =>
  upsertOne(tables.providers, providerToRow(provider), providerFromRow);

export async function saveSputumFollowUp(s: SputumFollowUp): Promise<SputumFollowUp> {
  const existing = await findOne(tables.sputumFollowUps, { patient_id: s.patientId, stage: s.stage });
  const existingId = typeof existing?.id === "string" ? existing.id : "";
  return upsertOne(tables.sputumFollowUps, sputumFollowUpToRow({ ...s, id: existingId || s.id }), sputumFollowUpFromRow);
}

export const saveRecordAttachment = (attachment: RecordAttachment): Promise<RecordAttachment> =>
  upsertOne(tables.recordAttachments, recordAttachmentToRow(attachment), recordAttachmentFromRow);

export async function restoreAppData(data: AppData, context: RepositoryContext = {}): Promise<{ saved: Record<keyof AppData, number>; warnings: string[] }> {
  const userId = context.profile?.userId;
  const warnings: string[] = [];
  const saved: Record<keyof AppData, number> = {
    patients: 0,
    labResults: 0,
    dotEntries: 0,
    contacts: 0,
    tptRecords: 0,
    sputumFollowUps: 0,
    diaryEntries: 0,
    tasks: 0,
    providers: 0,
    attachments: 0,
  };

  for (const patient of data.patients) {
    await savePatient({ ...patient, ownerId: patient.ownerId || userId });
    saved.patients += 1;
  }
  for (const lab of data.labResults) { await saveLabResult(lab); saved.labResults += 1; }
  for (const dot of data.dotEntries) { await saveDotEntry(dot); saved.dotEntries += 1; }
  for (const contact of data.contacts) { await saveContact(contact); saved.contacts += 1; }
  for (const tpt of data.tptRecords) { await saveTptRecord(tpt); saved.tptRecords += 1; }
  for (const sputum of data.sputumFollowUps) { await saveSputumFollowUp(sputum); saved.sputumFollowUps += 1; }
  for (const entry of data.diaryEntries) { await saveDiaryEntry({ ...entry, userId: entry.userId || userId }); saved.diaryEntries += 1; }
  for (const task of data.tasks) { await saveTask(task); saved.tasks += 1; }
  for (const provider of data.providers) { await saveProvider(provider); saved.providers += 1; }

  for (const attachment of data.attachments) {
    if (userId && (attachment.uploadedBy !== userId || !attachment.storageKey.startsWith(`${userId}/`))) {
      warnings.push(`Skipped attachment metadata for ${attachment.fileName}.`);
      continue;
    }
    await upsertOne(tables.recordAttachments, recordAttachmentToRow(attachment), recordAttachmentFromRow);
    saved.attachments += 1;
  }

  return { saved, warnings };
}

export async function uploadRecordAttachment({
  patientId,
  file,
  profile,
  attachmentId,
  createdAt,
}: {
  patientId: string;
  file: File;
  profile: Profile;
  attachmentId?: string;
  createdAt?: string;
}): Promise<RecordAttachment> {
  const key = `${profile.userId}/${patientId}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${safeFileName(file.name)}`;
  const { data: storedFile, error: uploadError } = await insforge.storage.from(attachmentBucket).upload(key, file);
  if (uploadError) throw toError(uploadError, "Unable to upload attachment.");
  if (!storedFile) throw new Error("Unable to upload attachment.");

  const attachment: RecordAttachment = {
    id: attachmentId || uid("att"),
    recordType: "patient",
    recordId: patientId,
    fileName: file.name || safeFileName(storedFile.key),
    fileType: storedFile.mimeType || file.type,
    fileSize: storedFile.size || file.size,
    bucket: storedFile.bucket || attachmentBucket,
    storageKey: storedFile.key,
    url: storedFile.url,
    uploadedBy: profile.userId,
    createdAt: createdAt || storedFile.uploadedAt || new Date().toISOString(),
  };

  return upsertOne(tables.recordAttachments, recordAttachmentToRow(attachment), recordAttachmentFromRow);
}

export async function openRecordAttachment(attachment: RecordAttachment): Promise<string> {
  const { data, error } = await insforge.storage.from(attachment.bucket).download(attachment.storageKey);
  if (error) throw toError(error, "Unable to open attachment.");
  if (!data) throw new Error("Unable to open attachment.");
  return URL.createObjectURL(data);
}
