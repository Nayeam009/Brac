import { isAfter, isBefore, parseISO } from "date-fns";
import { formatDateDisplay, toLocalIsoDate } from "../lib/dateFormat";
import type {
  ContactPerson, DiaryEntry, DiaryType, DotEntry, LabResult, Patient, SputumFollowUp, Task, TaskType, TptRecord,
} from "./types";

type SputumStage = "2M" | "5M" | "6M";
type TreatmentDates = { ipEndDate: string; treatmentEndDate: string; sputumDueDates: Record<SputumStage, string> };
type PatientTreatmentSchedule = { ipEndDate?: string; treatmentEndDate?: string; protocolTreatmentEndDate?: string; sputumDueDates?: Partial<Record<SputumStage, string>> };
type PatientDotPlan = { startDate?: string; endDate?: string; totalDays: number; source: "drug-start" | "treatment-start" | "missing" };
export type PatientEntryMode = "live" | "historical";
export type PatientEntryModeSource = "auto" | "manual";
export type PatientEntryModeInfo = {
  entryMode: PatientEntryMode;
  entryModeSource: PatientEntryModeSource;
  historicalCutoffDate: string;
  historicalReason?: string;
};

export const PROGRAM_DAYS_PER_MONTH = 30;
export const TB_IP_DAYS = PROGRAM_DAYS_PER_MONTH * 2;
export const TB_CP_DAYS = PROGRAM_DAYS_PER_MONTH * 4;
export const TB_TOTAL_DAYS = TB_IP_DAYS + TB_CP_DAYS;
export const HISTORICAL_BACK_ENTRY_CUTOFF_DATE = "2026-05-15";
export const TREATMENT_LENGTH_MONTH_OPTIONS = [6, 7, 8, 9, 10, 11, 12] as const;

const isTreatmentLengthOption = (value: number) => (TREATMENT_LENGTH_MONTH_OPTIONS as readonly number[]).includes(value);
const treatmentLengthFromMetadata = (metadata?: Record<string, unknown>) => {
  const value = metadata?.treatmentLengthMonths;
  return typeof value === "number" && isTreatmentLengthOption(value) ? value : undefined;
};

const isoDateFromUtc = (date: Date) => date.toISOString().slice(0, 10);
const parseIsoDateOnlyUtc = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day));
};

export function dateForTreatmentDay(startDate: string, dayNumber: number): string {
  const start = parseIsoDateOnlyUtc(startDate);
  if (!start || !Number.isFinite(dayNumber) || dayNumber < 1) return "";
  start.setUTCDate(start.getUTCDate() + Math.trunc(dayNumber) - 1);
  return isoDateFromUtc(start);
}

export function calculateTreatmentDates(treatmentStartDate: string): TreatmentDates {
  return {
    ipEndDate: dateForTreatmentDay(treatmentStartDate, TB_IP_DAYS),
    treatmentEndDate: dateForTreatmentDay(treatmentStartDate, TB_TOTAL_DAYS),
    sputumDueDates: {
      "2M": dateForTreatmentDay(treatmentStartDate, TB_IP_DAYS),
      "5M": dateForTreatmentDay(treatmentStartDate, PROGRAM_DAYS_PER_MONTH * 5),
      "6M": dateForTreatmentDay(treatmentStartDate, TB_TOTAL_DAYS),
    },
  };
}

const sputumStagesForPatient = (patient: Pick<Patient, "tbType" | "confirmationMethod">): SputumStage[] => {
  if (patient.tbType === "Extra-pulmonary") return [];
  return patient.confirmationMethod === "CD" ? ["2M"] : ["2M", "5M", "6M"];
};

const resolveSputumDueDates = (startDate: string, patient: Pick<Patient, "tbType" | "confirmationMethod">) => {
  const allDates = calculateTreatmentDates(startDate).sputumDueDates;
  return sputumStagesForPatient(patient).reduce<Partial<Record<SputumStage, string>>>((dates, stage) => {
    dates[stage] = allDates[stage];
    return dates;
  }, {});
};

export function resolvePatientTreatmentSchedule(patient: Pick<Patient, "tbType" | "confirmationMethod" | "treatmentStartDate" | "drugStartDate" | "treatmentEndDate" | "metadata">): PatientTreatmentSchedule {
  const courseStartDate = patient.drugStartDate || patient.treatmentStartDate;
  const isCustomEndDate = patient.metadata?.treatmentEndMode === "custom";
  const treatmentLengthMonths = treatmentLengthFromMetadata(patient.metadata) || (patient.drugStartDate && !isCustomEndDate ? 6 : undefined);
  const calculatedTreatmentEndDate = courseStartDate && treatmentLengthMonths ? calculateTreatmentEndDateFromMonths(courseStartDate, treatmentLengthMonths) : undefined;
  const treatmentEndDate = calculatedTreatmentEndDate || patient.treatmentEndDate || (courseStartDate ? dateForTreatmentDay(courseStartDate, TB_TOTAL_DAYS) : undefined);
  if (!courseStartDate) return { treatmentEndDate };
  const dates = calculateTreatmentDates(courseStartDate);
  if (patient.tbType === "Extra-pulmonary") {
    return {
      ipEndDate: dates.ipEndDate,
      treatmentEndDate,
      protocolTreatmentEndDate: dates.treatmentEndDate,
    };
  }
  return { ...dates, treatmentEndDate, protocolTreatmentEndDate: dates.treatmentEndDate, sputumDueDates: resolveSputumDueDates(courseStartDate, patient) };
}

export function calculateTptEndDate(startDate: string, regimen: string): string {
  return dateForTreatmentDay(startDate, regimen === "6H" ? TB_TOTAL_DAYS : PROGRAM_DAYS_PER_MONTH * 3);
}

const inclusiveDays = (startDate?: string, endDate?: string) => {
  if (!startDate || !endDate) return 0;
  const start = parseIsoDateOnlyUtc(startDate);
  const end = parseIsoDateOnlyUtc(endDate);
  if (!start || !end) return 0;
  const days = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  return Number.isFinite(days) && days > 0 ? days : 0;
};

export function calculateTreatmentEndDateFromMonths(startDate: string, months: number): string {
  if (!Number.isFinite(months) || months < 1) return "";
  return dateForTreatmentDay(startDate, Math.trunc(months) * PROGRAM_DAYS_PER_MONTH);
}

export function inferTreatmentLengthMonths(startDate?: string, endDate?: string): number | undefined {
  const days = inclusiveDays(startDate, endDate);
  return TREATMENT_LENGTH_MONTH_OPTIONS.find((months) => days === months * PROGRAM_DAYS_PER_MONTH);
}

export function treatmentDayNumberForDate(startDate: string | undefined, date: string | undefined, endDate?: string): number | null {
  if (!startDate || !date) return null;
  const day = inclusiveDays(startDate, date);
  if (!day) return null;
  if (endDate && date.slice(0, 10) > endDate.slice(0, 10)) return null;
  return day;
}

export function resolvePatientDotPlan(patient: Pick<Patient, "drugStartDate" | "treatmentStartDate" | "treatmentEndDate" | "tbType" | "metadata">): PatientDotPlan {
  const startDate = patient.drugStartDate || patient.treatmentStartDate;
  const source = patient.drugStartDate ? "drug-start" : patient.treatmentStartDate ? "treatment-start" : "missing";
  if (!startDate) return { totalDays: TB_TOTAL_DAYS, source };
  const isCustomEndDate = patient.metadata?.treatmentEndMode === "custom";
  const treatmentLengthMonths = treatmentLengthFromMetadata(patient.metadata) || (patient.drugStartDate && !isCustomEndDate ? 6 : undefined);
  const endDate = treatmentLengthMonths ? calculateTreatmentEndDateFromMonths(startDate, treatmentLengthMonths) : patient.treatmentEndDate || dateForTreatmentDay(startDate, TB_TOTAL_DAYS);
  const totalDays = Math.max(TB_TOTAL_DAYS, inclusiveDays(startDate, endDate));
  return { startDate, endDate: dateForTreatmentDay(startDate, totalDays), totalDays, source };
}

const dateOnly = (value?: string) => value?.slice(0, 10) || "";
const isValidEntryMode = (value: unknown): value is PatientEntryMode => value === "live" || value === "historical";
const isValidEntryModeSource = (value: unknown): value is PatientEntryModeSource => value === "auto" || value === "manual";
const isBeforeCutoff = (value?: string, cutoff = HISTORICAL_BACK_ENTRY_CUTOFF_DATE) => {
  const date = dateOnly(value);
  return Boolean(date && date < cutoff);
};

export function resolvePatientEntryMode(patient: Pick<Patient, "registrationDate" | "treatmentStartDate" | "metadata">, today = HISTORICAL_BACK_ENTRY_CUTOFF_DATE): PatientEntryModeInfo {
  const metadata = patient.metadata || {};
  const savedMode = metadata.entryMode;
  const savedSource = metadata.entryModeSource;
  const cutoff = typeof metadata.historicalCutoffDate === "string" && metadata.historicalCutoffDate ? metadata.historicalCutoffDate : today;

  if (isValidEntryMode(savedMode) && savedSource === "manual") {
    return {
      entryMode: savedMode,
      entryModeSource: "manual",
      historicalCutoffDate: cutoff,
      historicalReason: savedMode === "historical" && typeof metadata.historicalReason === "string" ? metadata.historicalReason : undefined,
    };
  }

  if (isBeforeCutoff(patient.registrationDate, cutoff)) {
    return {
      entryMode: "historical",
      entryModeSource: isValidEntryModeSource(savedSource) ? savedSource : "auto",
      historicalCutoffDate: cutoff,
      historicalReason: `Registration date is before ${formatDateDisplay(cutoff)}`,
    };
  }

  if (isBeforeCutoff(patient.treatmentStartDate, cutoff)) {
    return {
      entryMode: "historical",
      entryModeSource: isValidEntryModeSource(savedSource) ? savedSource : "auto",
      historicalCutoffDate: cutoff,
      historicalReason: `Treatment start date is before ${formatDateDisplay(cutoff)}`,
    };
  }

  return {
    entryMode: "live",
    entryModeSource: isValidEntryModeSource(savedSource) ? savedSource : "auto",
    historicalCutoffDate: cutoff,
  };
}

export function withResolvedPatientEntryMetadata(patient: Patient, today = HISTORICAL_BACK_ENTRY_CUTOFF_DATE): Patient {
  const entryMode = resolvePatientEntryMode(patient, today);
  return {
    ...patient,
    metadata: {
      ...(patient.metadata || {}),
      entryMode: entryMode.entryMode,
      entryModeSource: entryMode.entryModeSource,
      historicalCutoffDate: entryMode.historicalCutoffDate,
      historicalReason: entryMode.historicalReason,
    },
  };
}

export function isHistoricalRecord(patient: Pick<Patient, "registrationDate" | "treatmentStartDate" | "metadata"> | undefined, recordDate?: string, today = HISTORICAL_BACK_ENTRY_CUTOFF_DATE): boolean {
  if (!patient || !recordDate) return false;
  const entryMode = resolvePatientEntryMode(patient, today);
  return entryMode.entryMode === "historical" && isBeforeCutoff(recordDate, entryMode.historicalCutoffDate);
}

export function shouldCreateLiveDiaryEntry(patient: Pick<Patient, "registrationDate" | "treatmentStartDate" | "metadata"> | undefined, recordDate?: string, _actionType?: DiaryType, today = HISTORICAL_BACK_ENTRY_CUTOFF_DATE): boolean {
  return !isHistoricalRecord(patient, recordDate, today);
}

export function detectDuplicatePatient(draft: Pick<Patient, "tr" | "name" | "phone">, patients: Patient[], currentPatientId?: string): string[] {
  const nTr = draft.tr?.trim().toLowerCase();
  const nName = draft.name?.trim().toLowerCase();
  const nPhone = draft.phone?.trim();
  const issues = new Set<string>();
  for (const p of patients) {
    if (p.id === currentPatientId) continue;
    if (nTr && p.tr?.trim().toLowerCase() === nTr) issues.add("TR_DUPLICATE");
    if (nName && nPhone && p.name?.trim().toLowerCase() === nName && p.phone?.trim() === nPhone) issues.add("NAME_PHONE_DUPLICATE");
  }
  return Array.from(issues);
}

type WorklistInput = { today: string; patients: Patient[]; labResults: LabResult[]; dotEntries: DotEntry[]; contacts: ContactPerson[]; tptRecords: TptRecord[]; sputumFollowUps?: SputumFollowUp[] };

const mkTask = (type: TaskType, patient: Patient | undefined, title: string, priority: Task["priority"], today: string, description?: string, dueDate?: string): Task => ({
  id: `${type}_${patient?.id || "general"}_${dueDate || today}`, patientId: patient?.id, type, title, description, dueDate, priority, status: "Open", createdAt: `${today}T00:00:00.000Z`,
});

const hasPositiveResult = (r = "") => /mtb detected|positive|detected/i.test(r);
const hasRifResistance = (r = "") => /rr|rif resistant|rifampicin resistant/i.test(r);

export function generateWorklist(input: WorklistInput): Task[] {
  const todayDate = parseISO(input.today);
  const tasks: Task[] = [];
  const contactsByPatient = new Map<string, ContactPerson[]>();
  const completedSputum = new Set<string>();
  const dotStatusByPatientDate = new Map<string, DotEntry["status"]>();
  for (const c of input.contacts) { const l = contactsByPatient.get(c.patientId) || []; l.push(c); contactsByPatient.set(c.patientId, l); }
  for (const dot of input.dotEntries) dotStatusByPatientDate.set(`${dot.patientId}:${dot.date}`, dot.status);
  for (const followUp of input.sputumFollowUps || []) {
    if (followUp.testDate || followUp.microscopy || followUp.microscopyResult || followUp.geneXpertResult || followUp.xpertTruenat || followUp.culture) {
      completedSputum.add(`${followUp.patientId}:${followUp.stage}`);
    }
  }

  for (const patient of input.patients) {
    const patientLabs = input.labResults.filter((l) => l.patientId === patient.id);

    for (const lab of patientLabs) {
      if (hasRifResistance(lab.result)) tasks.push(mkTask("DR_TB_REFERRAL", patient, "RR result urgent review", "Critical", input.today, `${patient.name} এর RR ফলাফল পাওয়া গেছে।`, lab.testDate));
      if (hasPositiveResult(lab.result) && !patient.treatmentStartDate) tasks.push(mkTask("TREATMENT_START_PENDING", patient, "MTB detected — treatment not started", "Critical", input.today, `${patient.name} এর চিকিৎসা শুরু pending।`, lab.testDate));
    }

    const missedDots = input.dotEntries.filter((d) => d.patientId === patient.id && d.status === "missed");
    for (const dot of missedDots) tasks.push(mkTask("DOT_MISSED", patient, "DOT missed follow-up", "High", input.today, `${patient.name} ${formatDateDisplay(dot.date)} তারিখে DOT missed।`, dot.date));

    const dotPlan = resolvePatientDotPlan(patient);
    if (dotPlan.startDate && dotPlan.endDate) {
      const lastTrackDate = input.today < dotPlan.endDate ? input.today : dotPlan.endDate;
      const lastTrackDay = treatmentDayNumberForDate(dotPlan.startDate, lastTrackDate, dotPlan.endDate) || 0;
      const missingDates: string[] = [];
      for (let day = 1; day <= lastTrackDay; day += 1) {
        const date = dateForTreatmentDay(dotPlan.startDate, day);
        if (!dotStatusByPatientDate.has(`${patient.id}:${date}`)) missingDates.push(date);
      }
      if (missingDates.length) {
        const first = missingDates[0];
        const last = missingDates[missingDates.length - 1];
        const range = first === last ? formatDateDisplay(first) : `${formatDateDisplay(first)} to ${formatDateDisplay(last)}`;
        tasks.push(mkTask(
          "DOT_NOT_UPDATED",
          patient,
          "DOT tracking incomplete",
          missingDates.length > 3 ? "High" : "Medium",
          input.today,
          `${patient.name} has ${missingDates.length} DOT day update missing (${range}).`,
          last,
        ));
      }
    }

    if (patient.nextFollowUpDate) {
      const fu = parseISO(patient.nextFollowUpDate);
      if (isBefore(fu, todayDate)) tasks.push(mkTask("FOLLOWUP_OVERDUE", patient, "Follow-up overdue", "High", input.today, `${patient.name} এর follow-up overdue।`, patient.nextFollowUpDate));
      else { const diff = (fu.getTime() - todayDate.getTime()) / 86400000; if (diff <= 3) tasks.push(mkTask("FOLLOWUP_DUE", patient, "Follow-up due soon", "Medium", input.today, `${patient.name} এর follow-up ${formatDateDisplay(patient.nextFollowUpDate)} তারিখে।`, patient.nextFollowUpDate)); }
    }

    if (patient.tbType === "Pulmonary" && patient.confirmationMethod === "BC" && !contactsByPatient.get(patient.id)?.length)
      tasks.push(mkTask("CI_PENDING", patient, "Contact investigation pending", "Medium", input.today, `${patient.name} এর CI করা দরকার।`));

    const treatmentEndDate = resolvePatientTreatmentSchedule(patient).treatmentEndDate;
    if (treatmentEndDate && !patient.outcome && isBefore(parseISO(treatmentEndDate), todayDate))
      tasks.push(mkTask("OUTCOME_PENDING", patient, "Treatment outcome pending", "High", input.today, `${patient.name} এর outcome pending।`, treatmentEndDate));

    // Sputum due tasks
    if (patient.tbType === "Pulmonary" && patient.treatmentStartDate) {
      const sputumDueDates = resolvePatientTreatmentSchedule(patient).sputumDueDates;
      if (!sputumDueDates) continue;
      for (const [stage, dueDate] of Object.entries(sputumDueDates)) {
        if (completedSputum.has(`${patient.id}:${stage}`)) continue;
        const due = parseISO(dueDate);
        const diff = (due.getTime() - todayDate.getTime()) / 86400000;
        if (diff <= 7 && diff >= -30) tasks.push(mkTask("FOLLOWUP_DUE", patient, `${stage} sputum follow-up ${diff < 0 ? "overdue" : "due"}`, diff < 0 ? "High" : "Medium", input.today, `${patient.name} এর ${stage} sputum follow-up।`, dueDate));
      }
    }
  }

  for (const tpt of input.tptRecords) {
    if (tpt.nextFollowUpDate && isAfter(todayDate, parseISO(tpt.nextFollowUpDate)))
      tasks.push({ id: `TPT_DUE_${tpt.id}`, patientId: tpt.patientId, type: "TPT_DUE", title: "TPT follow-up due", description: `${tpt.name} এর TPT follow-up বাকি।`, dueDate: tpt.nextFollowUpDate, priority: "Medium", status: "Open", createdAt: `${input.today}T00:00:00.000Z` });
  }

  return tasks;
}

type BuildDiaryInput = { type: DiaryType; patient?: Patient; details: string; now?: Date; userId?: string; userName?: string; metadata?: Record<string, unknown> };

export function buildDiaryEntry(input: BuildDiaryInput): DiaryEntry {
  const now = input.now || new Date();
  return { id: `dia_${now.getTime().toString(36)}`, time: now.toISOString(), date: toLocalIsoDate(now), type: input.type, patientId: input.patient?.id, tr: input.patient?.tr, patientName: input.patient?.name, details: input.details, userId: input.userId, userName: input.userName || "FO", metadata: input.metadata };
}

/* ── Data quality checks ── */
export function detectDataQualityIssues(patients: Patient[], labResults: LabResult[], sputumFollowUps: SputumFollowUp[] = [], today = toLocalIsoDate()): { patient: Patient; issue: string; severity: "high" | "medium" | "low" }[] {
  const issues: { patient: Patient; issue: string; severity: "high" | "medium" | "low" }[] = [];
  const sputumByPatient = new Map<string, SputumFollowUp[]>();
  for (const followUp of sputumFollowUps) {
    const list = sputumByPatient.get(followUp.patientId) || [];
    list.push(followUp);
    sputumByPatient.set(followUp.patientId, list);
  }

  for (const p of patients) {
    const entryMode = resolvePatientEntryMode(p, today);
    if (entryMode.entryMode === "historical" && (!p.tr || !p.registrationDate || !p.treatmentStartDate || !p.regimenType))
      issues.push({ patient: p, issue: "Previous patient record needs completion", severity: "medium" });
    if (!p.tr) issues.push({ patient: p, issue: "TR / registration number missing", severity: "medium" });
    if (!p.registrationDate) issues.push({ patient: p, issue: "Registration date missing", severity: "medium" });
    if (!p.phone) issues.push({ patient: p, issue: "মোবাইল নম্বর নেই", severity: "medium" });
    if (!p.treatmentStartDate && labResults.some((l) => l.patientId === p.id && hasPositiveResult(l.result)))
      issues.push({ patient: p, issue: "Positive lab result কিন্তু চিকিৎসা শুরু হয়নি", severity: "high" });
    if (p.outcome === "Transfer Out" && !p.transferTo) issues.push({ patient: p, issue: "Transfer Out কিন্তু destination নেই", severity: "medium" });
    if (p.outcome && !p.outcomeDate) issues.push({ patient: p, issue: "Outcome date missing", severity: "medium" });
    if (p.outcome && !p.signOfficer) issues.push({ patient: p, issue: "Outcome sign-off officer missing", severity: "medium" });
    if (!p.age) issues.push({ patient: p, issue: "বয়স নেই", severity: "low" });
    if (p.treatmentStartDate && !p.regimenType) issues.push({ patient: p, issue: "চিকিৎসা শুরু হয়েছে কিন্তু regimen নির্বাচন হয়নি", severity: "medium" });
    if (p.treatmentStartDate && !p.drugStartDate) issues.push({ patient: p, issue: "Drug start date missing for DOT tracking", severity: "medium" });
    if (p.regimenType && /FDC/i.test(p.regimenType) && !p.weightKg) issues.push({ patient: p, issue: "Patient weight missing for auto dose calculation", severity: "medium" });
    if (p.treatmentStartDate && !p.dotProviderName) issues.push({ patient: p, issue: "DOT provider missing", severity: "medium" });
    const dotStartDate = p.drugStartDate || p.treatmentStartDate;
    if (p.treatmentEndDate && dotStartDate && dateOnly(p.treatmentEndDate) < dateOnly(dotStartDate))
      issues.push({ patient: p, issue: "Treatment end date is before drug start date", severity: "high" });
    if (p.tbType === "Extra-pulmonary" && (sputumByPatient.get(p.id)?.length || 0) > 0)
      issues.push({ patient: p, issue: "EP patient has sputum follow-up record", severity: "low" });
    if (p.tbType === "Pulmonary" && p.treatmentStartDate) {
      const sputumDueDates = resolvePatientTreatmentSchedule(p).sputumDueDates;
      if (sputumDueDates) {
        for (const [stage, dueDate] of Object.entries(sputumDueDates)) {
          const completed = (sputumByPatient.get(p.id) || []).some((followUp) =>
            followUp.stage === stage && (followUp.testDate || followUp.microscopy || followUp.microscopyResult || followUp.geneXpertResult || followUp.xpertTruenat || followUp.culture),
          );
          if (!completed && isBefore(parseISO(dueDate), parseISO(today)))
            issues.push({ patient: p, issue: `${stage} sputum follow-up overdue`, severity: "medium" });
        }
      }
    }
  }
  return issues;
}

/* ── CSV export ── */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => { const v = String(row[h] ?? ""); return v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v; }).join(","));
  }
  return lines.join("\n");
}

/* ── Drug regimen data ── */
type DrugDoseTable = "adult-fdc" | "child-fdc";
type DrugRegimenDefinition = { name: string; drugs: string[]; doseTable?: DrugDoseTable; caution?: string };
type DrugWeightBand = { min: number; max?: number; tablets: number; label: string };
export type DrugDoseLine = {
  drug: string;
  phase: string;
  duration?: string;
  tabletsPerDay?: number;
  selected: boolean;
  doseText: string;
  note?: string;
};
export type DrugDosePlan = {
  regimenName: string;
  weightKg?: number;
  weightBand?: string;
  summary: string;
  lines: DrugDoseLine[];
  caution: string;
};

const ADULT_FDC_BANDS: DrugWeightBand[] = [
  { min: 30, max: 39, tablets: 2, label: "30-39 kg" },
  { min: 40, max: 54, tablets: 3, label: "40-54 kg" },
  { min: 55, max: 70, tablets: 4, label: "55-70 kg" },
  { min: 71, tablets: 5, label: "71+ kg" },
];

const CHILD_FDC_BANDS: DrugWeightBand[] = [
  { min: 4, max: 7, tablets: 1, label: "4-7 kg" },
  { min: 8, max: 11, tablets: 2, label: "8-11 kg" },
  { min: 12, max: 15, tablets: 3, label: "12-15 kg" },
  { min: 16, max: 24, tablets: 4, label: "16-24 kg" },
];

const findWeightBand = (weightKg: number | undefined, bands: DrugWeightBand[]) => {
  if (!weightKg || weightKg <= 0) return undefined;
  return bands.find((band) => weightKg >= band.min && (band.max == null || weightKg <= band.max));
};

const isContinuationPhase = (phase?: string) => /continuation|completed/i.test(phase || "");

export const DRUG_REGIMENS: Record<string, DrugRegimenDefinition> = {
  "CAT-1 / 4FDC": { name: "CAT-1 / 4FDC (New Case)", drugs: ["HRZE (4FDC)", "HR (2FDC) - CP"], doseTable: "adult-fdc" },
  "2FDC (CP)": { name: "2FDC (Continuation Phase)", drugs: ["HR (2FDC)"], doseTable: "adult-fdc" },
  "3FDC (Paediatric)": { name: "3FDC (Paediatric)", drugs: ["HRZ (3FDC)", "HR (2FDC) - CP"], doseTable: "child-fdc" },
  "Retreatment": { name: "Retreatment Regimen", drugs: ["HRZES (IP)", "HRZE (IP ext)", "HRE (CP)"], caution: "Retreatment regimens need programme/clinician confirmation before dose entry." },
  "TPT - 3HR": { name: "TPT 3HR Adult", drugs: ["Isoniazid + Rifampicin"], caution: "TPT dose depends on age, formulation, and programme guidance." },
  "TPT - 3HP": { name: "TPT 3HP Adult", drugs: ["Isoniazid + Rifapentine"], caution: "3HP is weekly dosing. Verify tablet counts with programme guidance." },
  "TPT — 3HR": { name: "TPT 3HR Adult", drugs: ["Isoniazid + Rifampicin"], caution: "TPT dose depends on age, formulation, and programme guidance." },
  "TPT — 3HP": { name: "TPT 3HP Adult", drugs: ["Isoniazid + Rifapentine"], caution: "3HP is weekly dosing. Verify tablet counts with programme guidance." },
  "DR-TB / MDR": { name: "DR-TB / MDR Regimen", drugs: ["Individual regimen as per DR-TB guideline"], caution: "DR-TB/MDR regimens are individualized and must not be auto-calculated here." },
};

export function calculateDrugDosePlan(regimenType = "", weightKg?: number, phase?: string): DrugDosePlan | null {
  const regimen = DRUG_REGIMENS[regimenType];
  if (!regimen) return null;

  const table = regimen.doseTable === "child-fdc" ? CHILD_FDC_BANDS : regimen.doseTable === "adult-fdc" ? ADULT_FDC_BANDS : [];
  const band = findWeightBand(weightKg, table);
  const needsWeight = Boolean(regimen.doseTable);
  const continuation = isContinuationPhase(phase);
  const doseText = band ? `${band.tablets} tablet${band.tablets > 1 ? "s" : ""} once daily` : needsWeight ? "Enter a valid weight" : "Verify manually";
  const caution = regimen.caution || "Auto-calculated tablet counts are guidance only. FO must verify with NTP/programme instruction before dispensing.";

  if (regimenType === "CAT-1 / 4FDC") {
    return {
      regimenName: regimen.name,
      weightKg,
      weightBand: band?.label,
      summary: band ? `${band.tablets} tablets/day for the active FDC phase` : "Weight needed for automatic tablet count",
      caution,
      lines: [
        { drug: "HRZE (4FDC)", phase: "Intensive phase", duration: "60 days", tabletsPerDay: band?.tablets, selected: !continuation, doseText },
        { drug: "HR (2FDC)", phase: "Continuation phase", duration: "120 days", tabletsPerDay: band?.tablets, selected: continuation, doseText },
      ],
    };
  }

  if (regimenType === "2FDC (CP)") {
    return {
      regimenName: regimen.name,
      weightKg,
      weightBand: band?.label,
      summary: band ? `${band.tablets} HR tablets/day` : "Weight needed for automatic tablet count",
      caution,
      lines: [{ drug: "HR (2FDC)", phase: "Continuation phase", duration: "120 days", tabletsPerDay: band?.tablets, selected: true, doseText }],
    };
  }

  if (regimenType === "3FDC (Paediatric)") {
    return {
      regimenName: regimen.name,
      weightKg,
      weightBand: band?.label,
      summary: band ? `${band.tablets} child FDC tablets/day` : "Use paediatric review if weight is outside 4-24 kg",
      caution,
      lines: [
        { drug: "HRZ (3FDC)", phase: "Intensive phase", duration: "60 days", tabletsPerDay: band?.tablets, selected: !continuation, doseText },
        { drug: "HR (2FDC)", phase: "Continuation phase", duration: "120 days", tabletsPerDay: band?.tablets, selected: continuation, doseText },
      ],
    };
  }

  return {
    regimenName: regimen.name,
    weightKg,
    summary: regimen.caution || "Manual dose confirmation required",
    caution,
    lines: regimen.drugs.map((drug, index) => ({ drug, phase: index === 0 ? "Programme regimen" : "Additional medicine", selected: index === 0, doseText: "Verify manually" })),
  };
}

const LEGACY_DRUG_REGIMENS: Record<string, { name: string; drugs: string[] }> = {
  "CAT-1 / 4FDC": { name: "CAT-1 / 4FDC (New Case)", drugs: ["HRZE (4FDC)", "HR (2FDC) — CP"] },
  "2FDC (CP)": { name: "2FDC (Continuation Phase)", drugs: ["HR (2FDC)"] },
  "3FDC (Paediatric)": { name: "3FDC (Paediatric)", drugs: ["HRZ (3FDC)"] },
  "Retreatment": { name: "Retreatment Regimen", drugs: ["HRZES (IP)", "HRZE (IP ext)", "HRE (CP)"] },
  "TPT — 3HR": { name: "TPT 3HR Adult", drugs: ["Isoniazid + Rifampicin"] },
  "TPT — 3HP": { name: "TPT 3HP Adult", drugs: ["Isoniazid + Rifapentine"] },
  "DR-TB / MDR": { name: "DR-TB / MDR Regimen", drugs: ["Individual regimen as per DR-TB guideline"] },
};
