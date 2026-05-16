import type { ContactPerson, DiaryEntry, DotEntry, LabResult, Patient, Provider, SputumFollowUp, Task, TptRecord } from "../domain/types";

export type AppData = {
  patients: Patient[];
  labResults: LabResult[];
  dotEntries: DotEntry[];
  contacts: ContactPerson[];
  tptRecords: TptRecord[];
  sputumFollowUps: SputumFollowUp[];
  diary: DiaryEntry[];
  tasks: Task[];
  providers: Provider[];
  syncMessage: string;
};
