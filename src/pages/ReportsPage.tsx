import type { ReactNode } from "react";
import { ClipboardCheck, Download, FileDown, FlaskConical, Printer, Users } from "lucide-react";
import type { AppData } from "./types";
import { PageHeader, SectionCard } from "../components";
import { calculateTptEndDate, HISTORICAL_BACK_ENTRY_CUTOFF_DATE, resolvePatientDotPlan, resolvePatientEntryMode, resolvePatientTreatmentSchedule, toCsv } from "../domain/automation";
import { formatDateDisplay, formatDateTimeDisplay } from "../lib/dateFormat";

const downloadJson = (name: string, val: unknown) => { const b = new Blob([JSON.stringify(val, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; a.click(); URL.revokeObjectURL(a.href); };
const downloadCsv = (name: string, rows: Record<string, unknown>[]) => { const b = new Blob([toCsv(rows)], { type: "text/csv" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; a.click(); URL.revokeObjectURL(a.href); };

const reportTimestampKeys = new Set([
  "completedAt",
  "createdAt",
  "time",
  "updatedAt",
]);

const reportDateKeys = new Set([
  "actualEndDate",
  "ciDate",
  "date",
  "drugStartDate",
  "dueDate",
  "expectedEndDate",
  "followUpDate",
  "ipEndDate",
  "lastVisitDate",
  "nextFollowUpDate",
  "outcomeDate",
  "registrationDate",
  "startDate",
  "testDate",
  "treatmentEndDate",
  "treatmentStartDate",
]);

export const formatReportDatesForExport = (value: unknown, key?: string): unknown => {
  if (typeof value === "string" && key && reportTimestampKeys.has(key)) return formatDateTimeDisplay(value) || value;
  if (typeof value === "string" && key && reportDateKeys.has(key)) return formatDateDisplay(value) || value;
  if (Array.isArray(value)) return value.map((item) => formatReportDatesForExport(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, formatReportDatesForExport(entryValue, entryKey)]));
  }
  return value;
};

export const derivePatientsForReportExport = (patients: AppData["patients"]): AppData["patients"] =>
  patients.map((patient) => {
    if (!patient.treatmentStartDate && !patient.drugStartDate) return patient;
    const schedule = resolvePatientTreatmentSchedule(patient);
    return {
      ...patient,
      ipEndDate: schedule.ipEndDate || patient.ipEndDate,
      treatmentEndDate: schedule.treatmentEndDate || patient.treatmentEndDate,
    };
  });

export const deriveTptRecordsForReportExport = (tptRecords: AppData["tptRecords"]): AppData["tptRecords"] =>
  tptRecords.map((record) => {
    if (!record.startDate) return record;
    return { ...record, expectedEndDate: calculateTptEndDate(record.startDate, record.regimen || "") };
  });

export function ReportsPage({ data, onLog }: { data: AppData; onLog: (d: string) => void }) {
  const patientsWithDerivedSchedule = derivePatientsForReportExport(data.patients);
  const tptWithDerivedSchedule = deriveTptRecordsForReportExport(data.tptRecords);

  const exp = (name: string, rows: unknown, csv?: Record<string, unknown>[]) => {
    downloadJson(`${name}.json`, formatReportDatesForExport(rows));
    if (csv) downloadCsv(`${name}.csv`, csv);
    onLog(`${name} report export করা হয়েছে।`);
  };

  const patientCsv = patientsWithDerivedSchedule.map((p) => {
    const entryMode = resolvePatientEntryMode(p, HISTORICAL_BACK_ENTRY_CUTOFF_DATE);
    const dotPlan = resolvePatientDotPlan(p);
    const schedule = resolvePatientTreatmentSchedule(p);
    return { TR: p.tr || "", Name: p.name, EntryMode: entryMode.entryMode === "historical" ? "Previous patient" : "Live patient", Age: p.age || "", Sex: p.sex || "", Phone: p.phone || "", Phase: p.phase || "", TBType: p.tbType || "", Outcome: p.outcome || "", TreatmentStart: formatDateDisplay(p.treatmentStartDate) || "", DrugStart: formatDateDisplay(p.drugStartDate) || "", DOTStart: formatDateDisplay(dotPlan.startDate) || "", IPEnd: formatDateDisplay(schedule.ipEndDate || p.ipEndDate) || "", TreatmentEnd: formatDateDisplay(schedule.treatmentEndDate || p.treatmentEndDate) || "", Union: p.union || "", SS: p.ssName || "" };
  });
  const dotMissed = data.dotEntries.filter((d) => d.status === "missed");
  const missedCsv = dotMissed.map((d) => { const p = data.patients.find((x) => x.id === d.patientId); return { TR: p?.tr || "", Name: p?.name || "", Date: formatDateDisplay(d.date), Status: d.status }; });

  const reports: { title: string; desc: string; icon: ReactNode; onClick: () => void }[] = [
    { title: "Patient Registry", desc: "সকল রোগীর তালিকা", icon: <Users />, onClick: () => exp("patient-registry", patientsWithDerivedSchedule, patientCsv) },
    { title: "DOT Missed", desc: "Missed DOT entries", icon: <ClipboardCheck />, onClick: () => exp("dot-missed", dotMissed, missedCsv) },
    { title: "Lab Results", desc: "GeneXpert, Microscopy, Culture", icon: <FlaskConical />, onClick: () => exp("lab-results", data.labResults) },
    { title: "CI/TPT Report", desc: "Contact investigation ও TPT", icon: <Download />, onClick: () => exp("ci-tpt", { contacts: data.contacts, tpt: tptWithDerivedSchedule }) },
    { title: "FO Diary", desc: "দৈনিক কাজের রেকর্ড", icon: <FileDown />, onClick: () => exp("fo-diary", data.diary) },
    { title: "Treatment Outcomes", desc: "Outcome recorded patients", icon: <Download />, onClick: () => exp("outcomes", patientsWithDerivedSchedule.filter((p) => p.outcome)) },
    { title: "Pre-treatment Pending", desc: "চিকিৎসা শুরু হয়নি", icon: <Download />, onClick: () => exp("pre-treatment", patientsWithDerivedSchedule.filter((p) => p.phase === "Pre-treatment")) },
    { title: "Follow-up Overdue", desc: "Follow-up due/overdue", icon: <Download />, onClick: () => exp("followup-overdue", data.tasks.filter((t) => t.type?.includes("FOLLOWUP"))) },
    { title: "Provider Performance", desc: "SS/DOT provider wise", icon: <Download />, onClick: () => exp("providers", data.providers) },
    { title: "Full Backup", desc: "সকল data backup", icon: <Download />, onClick: () => { downloadJson("tb-fo-full-backup.json", data); onLog("tb-fo-full-backup report export করা হয়েছে।"); } },
  ];

  return (
    <>
      <PageHeader title="রিপোর্ট" subtitle="Patient, DOT, Lab, CI/TPT, Diary exports (JSON + CSV)" action={<button className="ghost-button" type="button" onClick={() => window.print()}><Printer size={16} /> Print</button>} />
      <SectionCard title="Available Reports" tone="info">
        <div className="report-grid">
          {reports.map((r) => (
            <button className="report-card" key={r.title} type="button" onClick={r.onClick}>
              {r.icon}<strong>{r.title}</strong><span>{r.desc}</span>
            </button>
          ))}
        </div>
      </SectionCard>
    </>
  );
}
