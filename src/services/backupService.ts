import type { AppData } from "./appRepository";

type Identified = { id?: string };

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? value as Record<string, unknown> : {};

const asArray = <T>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];

export function parseBackupData(value: unknown): AppData {
  const record = asRecord(value);
  if (!Array.isArray(record.patients)) throw new Error("Invalid backup file format.");

  return {
    patients: asArray(record.patients),
    labResults: asArray(record.labResults),
    dotEntries: asArray(record.dotEntries),
    contacts: asArray(record.contacts),
    tptRecords: asArray(record.tptRecords),
    sputumFollowUps: asArray(record.sputumFollowUps),
    diaryEntries: asArray(record.diaryEntries ?? record.diary),
    tasks: asArray(record.tasks),
    providers: asArray(record.providers),
    attachments: asArray(record.attachments),
  };
}

const mergeById = <T extends Identified>(current: T[], incoming: T[]): T[] => {
  const currentIds = new Set(current.map((item) => item.id).filter(Boolean));
  const incomingById = new Map(incoming.filter((item) => item.id).map((item) => [item.id, item]));
  const newIncoming = incoming.filter((item) => item.id && !currentIds.has(item.id));
  return [
    ...newIncoming,
    ...current.map((item) => item.id && incomingById.has(item.id) ? incomingById.get(item.id) as T : item),
  ];
};

export function mergeBackupData(current: AppData, incoming: AppData, currentUserId?: string): { data: AppData; warnings: string[] } {
  const warnings: string[] = [];
  const patients = mergeById(current.patients, incoming.patients);
  const patientIds = new Set(patients.map((patient) => patient.id));
  const incomingAttachments = incoming.attachments.filter((attachment) => {
    if (currentUserId && attachment.uploadedBy !== currentUserId) return false;
    if (currentUserId && !attachment.storageKey.startsWith(`${currentUserId}/`)) return false;
    return patientIds.has(attachment.recordId);
  });
  const skippedAttachments = incoming.attachments.length - incomingAttachments.length;
  if (skippedAttachments > 0) warnings.push(`Skipped ${skippedAttachments} attachment metadata record from another Field Officer.`);

  return {
    data: {
      patients,
      labResults: mergeById(current.labResults, incoming.labResults),
      dotEntries: mergeById(current.dotEntries, incoming.dotEntries),
      contacts: mergeById(current.contacts, incoming.contacts),
      tptRecords: mergeById(current.tptRecords, incoming.tptRecords),
      sputumFollowUps: mergeById(current.sputumFollowUps, incoming.sputumFollowUps),
      diaryEntries: mergeById(current.diaryEntries, incoming.diaryEntries),
      tasks: mergeById(current.tasks, incoming.tasks),
      providers: mergeById(current.providers, incoming.providers),
      attachments: mergeById(current.attachments, incomingAttachments),
    },
    warnings,
  };
}
