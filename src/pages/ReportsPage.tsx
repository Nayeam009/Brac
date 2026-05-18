import type { ReactNode } from "react";
import { ClipboardCheck, Download, FlaskConical, MapPin, Printer, Users } from "lucide-react";
import type { AppData } from "./types";
import { PageHeader, SectionCard } from "../components";
import { calculateTptEndDate, dateForTreatmentDay, HISTORICAL_BACK_ENTRY_CUTOFF_DATE, resolvePatientDotPlan, resolvePatientEntryMode, resolvePatientTreatmentSchedule, toCsv } from "../domain/automation";
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

type CriticalSputumInfo = {
  stage: string;
  dueDate: string;
  testDate: string;
  result: string;
  weight: string;
};

export type CriticalInfoRow = {
  patientId: string;
  location: string;
  tr: string;
  name: string;
  age: string;
  phone: string;
  dotName: string;
  dotPhone: string;
  ipEndDate: string;
  treatmentEndDate: string;
  monthlyFollowUps: { label: string; date: string }[];
  sputum: CriticalSputumInfo[];
};

const notRecorded = "Not recorded";

const displayOrMissing = (value?: string | number) => {
  if (value === 0) return "0";
  return value ? String(value) : notRecorded;
};

const patientLocationLabel = (patient: AppData["patients"][number]) => {
  const parts = [patient.union, patient.ward ? `Ward ${patient.ward}` : "", patient.upazila, patient.district].filter(Boolean);
  return parts.length ? parts.join(" - ") : patient.address || "Location not recorded";
};

const sputumResultText = (followUp?: AppData["sputumFollowUps"][number]) =>
  [followUp?.microscopyResult || followUp?.microscopy, followUp?.geneXpertResult || followUp?.xpertTruenat, followUp?.culture]
    .filter(Boolean)
    .join(" / ") || "Pending";

export const deriveCriticalInfoRows = (patients: AppData["patients"], sputumFollowUps: AppData["sputumFollowUps"]): CriticalInfoRow[] =>
  patients.map((patient) => {
    const schedule = resolvePatientTreatmentSchedule(patient);
    const dotPlan = resolvePatientDotPlan({ ...patient, treatmentEndDate: schedule.treatmentEndDate || patient.treatmentEndDate });
    const startDate = dotPlan.startDate;
    const monthCount = startDate ? Math.max(1, Math.min(12, Math.ceil(dotPlan.totalDays / 30))) : 0;
    const monthlyFollowUps = Array.from({ length: monthCount }, (_, index) => {
      const monthNumber = index + 1;
      return { label: `${monthNumber}M`, date: dateForTreatmentDay(startDate || "", monthNumber * 30) };
    });
    const patientSputum = sputumFollowUps.filter((followUp) => followUp.patientId === patient.id);
    const sputum = Object.entries(schedule.sputumDueDates || {}).map(([stage, dueDate]) => {
      const followUp = patientSputum.find((item) => item.stage === stage);
      return {
        stage,
        dueDate: dueDate || "",
        testDate: followUp?.testDate || "",
        result: sputumResultText(followUp),
        weight: followUp?.weightKg ? `${followUp.weightKg} kg` : notRecorded,
      };
    });

    return {
      patientId: patient.id,
      location: patientLocationLabel(patient),
      tr: patient.tr || notRecorded,
      name: patient.name || notRecorded,
      age: displayOrMissing(patient.age),
      phone: patient.phone || notRecorded,
      dotName: patient.dotProviderName || patient.ssName || notRecorded,
      dotPhone: patient.ssPhone || notRecorded,
      ipEndDate: schedule.ipEndDate || patient.ipEndDate || "",
      treatmentEndDate: schedule.treatmentEndDate || patient.treatmentEndDate || "",
      monthlyFollowUps,
      sputum,
    };
  }).sort((a, b) => a.location.localeCompare(b.location) || a.tr.localeCompare(b.tr) || a.name.localeCompare(b.name));

export function ReportsPage({ data, onExport }: { data: AppData; onExport: () => void }) {
  const patientsWithDerivedSchedule = derivePatientsForReportExport(data.patients);
  const tptWithDerivedSchedule = deriveTptRecordsForReportExport(data.tptRecords);
  const criticalInfoRows = deriveCriticalInfoRows(patientsWithDerivedSchedule, data.sputumFollowUps);
  const criticalInfoCsv = criticalInfoRows.map((row) => ({
    Location: row.location,
    TR: row.tr,
    Name: row.name,
    Age: row.age,
    Phone: row.phone,
    DOTName: row.dotName,
    DOTPhone: row.dotPhone,
    IPEnd: formatDateDisplay(row.ipEndDate) || "",
    TreatmentEnd: formatDateDisplay(row.treatmentEndDate) || "",
    MonthlyFollowUps: row.monthlyFollowUps.map((item) => `${item.label}: ${formatDateDisplay(item.date)}`).join("; "),
    Sputum: row.sputum.map((item) => `${item.stage}: due ${formatDateDisplay(item.dueDate) || "NA"}, test ${formatDateDisplay(item.testDate) || "pending"}, result ${item.result}, weight ${item.weight}`).join("; ") || "Not required",
  }));
  const criticalGroups = Array.from(criticalInfoRows.reduce((groups, row) => {
    const rows = groups.get(row.location) || [];
    rows.push(row);
    groups.set(row.location, rows);
    return groups;
  }, new Map<string, CriticalInfoRow[]>()).entries());

  const exp = (name: string, rows: unknown, csv?: Record<string, unknown>[]) => {
    downloadJson(`${name}.json`, formatReportDatesForExport(rows));
    if (csv) downloadCsv(`${name}.csv`, csv);
    onExport();
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
    { title: "Critical Info", desc: "Location-wise patient summary", icon: <MapPin />, onClick: () => exp("critical-info", criticalInfoRows, criticalInfoCsv) },
    { title: "Patient Registry", desc: "সকল রোগীর তালিকা", icon: <Users />, onClick: () => exp("patient-registry", patientsWithDerivedSchedule, patientCsv) },
    { title: "DOT Missed", desc: "Missed DOT entries", icon: <ClipboardCheck />, onClick: () => exp("dot-missed", dotMissed, missedCsv) },
    { title: "Lab Results", desc: "GeneXpert, Microscopy, Culture", icon: <FlaskConical />, onClick: () => exp("lab-results", data.labResults) },
    { title: "CI/TPT Report", desc: "Contact investigation ও TPT", icon: <Download />, onClick: () => exp("ci-tpt", { contacts: data.contacts, tpt: tptWithDerivedSchedule }) },
    { title: "Treatment Outcomes", desc: "Outcome recorded patients", icon: <Download />, onClick: () => exp("outcomes", patientsWithDerivedSchedule.filter((p) => p.outcome)) },
    { title: "Pre-treatment Pending", desc: "চিকিৎসা শুরু হয়নি", icon: <Download />, onClick: () => exp("pre-treatment", patientsWithDerivedSchedule.filter((p) => p.phase === "Pre-treatment")) },
    { title: "Follow-up Overdue", desc: "Follow-up due/overdue", icon: <Download />, onClick: () => exp("followup-overdue", data.tasks.filter((t) => t.type?.includes("FOLLOWUP"))) },
    { title: "Provider Performance", desc: "SS/DOT provider wise", icon: <Download />, onClick: () => exp("providers", data.providers) },
    { title: "Full Backup", desc: "সকল data backup", icon: <Download />, onClick: () => { downloadJson("tb-fo-full-backup.json", data); onExport(); } },
  ];

  return (
    <>
      <PageHeader title="রিপোর্ট" subtitle="Patient, DOT, Lab, CI/TPT exports (JSON + CSV)" action={<button className="ghost-button" type="button" onClick={() => window.print()}><Printer size={16} /> Print</button>} />
      <SectionCard
        title="Critical Info"
        tone="danger"
        action={<button className="ghost-button" type="button" onClick={() => exp("critical-info", criticalInfoRows, criticalInfoCsv)}><Download size={16} /> Export</button>}
      >
        <p className="critical-info-note">Location-wise short patient summary for FO field follow-up. Dates are calculated from Drug start date with 1 month = 30 programme days.</p>
        {criticalGroups.length ? (
          <div className="critical-location-list">
            {criticalGroups.map(([location, rows]) => (
              <div className="critical-location-group" key={location}>
                <div className="critical-location-head">
                  <MapPin size={18} />
                  <strong>{location}</strong>
                  <span>{rows.length} patient{rows.length > 1 ? "s" : ""}</span>
                </div>
                <div className="critical-patient-list">
                  {rows.map((row) => (
                    <article className="critical-patient-card" key={row.patientId}>
                      <div className="critical-patient-main">
                        <strong>{row.tr} - {row.name}</strong>
                        <span>Age {row.age} - Phone {row.phone}</span>
                        <span>DOT: {row.dotName} - {row.dotPhone}</span>
                      </div>
                      <div className="critical-date-grid">
                        <span><b>IP end</b>{formatDateDisplay(row.ipEndDate) || notRecorded}</span>
                        <span><b>Treatment end</b>{formatDateDisplay(row.treatmentEndDate) || notRecorded}</span>
                      </div>
                      <div className="critical-chip-row" aria-label={`${row.name} monthly follow-up dates`}>
                        {row.monthlyFollowUps.length ? row.monthlyFollowUps.map((item) => (
                          <span key={item.label}>{item.label}: {formatDateDisplay(item.date) || notRecorded}</span>
                        )) : <span>Drug start date needed</span>}
                      </div>
                      <div className="critical-sputum-row">
                        {row.sputum.length ? row.sputum.map((item) => (
                          <span key={item.stage}>
                            <b>{item.stage}</b> due {formatDateDisplay(item.dueDate) || notRecorded} - test {formatDateDisplay(item.testDate) || "Pending"} - {item.result} - wt {item.weight}
                          </span>
                        )) : <span>Sputum follow-up not required</span>}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : <p className="empty-copy">No patient records yet.</p>}
      </SectionCard>
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
