import { useMemo, useState } from "react";
import { CalendarCheck, Download, Printer, Search } from "lucide-react";
import { PageHeader, SectionCard, StatusBadge } from "../components";
import { resolvePatientTreatmentSchedule, toCsv } from "../domain/automation";
import type { Patient, SputumFollowUp, TreatmentPhase } from "../domain/types";
import { formatDateDisplay, toLocalIsoMonth } from "../lib/dateFormat";

const FOLLOW_UP_STAGES = ["2M", "5M", "6M"] as const;
type FollowUpStage = typeof FOLLOW_UP_STAGES[number];

const CLOSED_PHASES = new Set<TreatmentPhase>([
  "Completed",
  "Defaulted / LFU",
  "Died",
  "Transfer Out",
  "Treatment Failure",
]);

const notRecorded = "Not recorded";

type StageSummary = {
  stage: FollowUpStage;
  dueDate: string;
  dueLabel: string;
  testDate: string;
  testLabel: string;
  labId: string;
  result: string;
  weight: string;
  comment: string;
  required: boolean;
  status: "done" | "pending" | "not-required" | "needs-drug-start";
};

export type MonthlyFollowUpRow = {
  patientId: string;
  serial: number;
  name: string;
  age: string;
  tr: string;
  address: string;
  mobile: string;
  dotName: string;
  dotPhone: string;
  location: string;
  treatmentStartDate: string;
  patientTypeAndTbType: string;
  tbType: string;
  confirmationMethod: string;
  hasDrugStart: boolean;
  dueThisMonth: boolean;
  stages: Record<FollowUpStage, StageSummary>;
};

const isActivePatient = (patient: Patient) => !patient.outcome && !CLOSED_PHASES.has(patient.phase || "");

const valueOrMissing = (value?: string | number) => {
  if (value === 0) return "0";
  return value ? String(value) : notRecorded;
};

const patientLocationLabel = (patient: Patient) => {
  const parts = [patient.union, patient.ward ? `Ward ${patient.ward}` : "", patient.upazila, patient.district].filter(Boolean);
  return parts.length ? parts.join(" - ") : patient.address || "Location not recorded";
};

const patientAddress = (patient: Patient) => {
  const parts = [patient.address, patient.ward ? `Ward ${patient.ward}` : "", patient.union, patient.upazila, patient.district].filter(Boolean);
  return parts.join(", ") || notRecorded;
};

const sputumResultText = (followUp?: SputumFollowUp) =>
  [followUp?.microscopyResult || followUp?.microscopy, followUp?.geneXpertResult || followUp?.xpertTruenat, followUp?.culture]
    .filter(Boolean)
    .join(" / ") || "Pending";

const stageNotRequiredLabel = (patient: Patient, stage: FollowUpStage) => {
  if (patient.tbType === "Extra-pulmonary") return "Not required (EP)";
  if (patient.confirmationMethod === "CD" && stage !== "2M") return "Not required (CD)";
  return "Not required";
};

const createStageSummary = (
  patient: Patient,
  followUps: SputumFollowUp[],
  stage: FollowUpStage,
  dueDate: string | undefined,
): StageSummary => {
  if (!patient.drugStartDate && patient.tbType !== "Extra-pulmonary") {
    return {
      stage,
      dueDate: "",
      dueLabel: "Drug start needed",
      testDate: "",
      testLabel: "Pending",
      labId: "",
      result: "Pending",
      weight: notRecorded,
      comment: "",
      required: true,
      status: "needs-drug-start",
    };
  }

  if (!dueDate) {
    const label = stageNotRequiredLabel(patient, stage);
    return {
      stage,
      dueDate: "",
      dueLabel: label,
      testDate: "",
      testLabel: label,
      labId: "",
      result: label,
      weight: "",
      comment: "",
      required: false,
      status: "not-required",
    };
  }

  const followUp = followUps.find((item) => item.patientId === patient.id && item.stage === stage);
  const result = sputumResultText(followUp);
  const hasRecordedResult = Boolean(followUp?.testDate || followUp?.labId || result !== "Pending" || followUp?.weightKg || followUp?.comment);

  return {
    stage,
    dueDate,
    dueLabel: formatDateDisplay(dueDate),
    testDate: followUp?.testDate || "",
    testLabel: followUp?.testDate ? formatDateDisplay(followUp.testDate) : "Pending",
    labId: followUp?.labId || "",
    result,
    weight: followUp?.weightKg ? `${followUp.weightKg} kg` : notRecorded,
    comment: followUp?.comment || "",
    required: true,
    status: hasRecordedResult ? "done" : "pending",
  };
};

export const deriveMonthlyFollowUpRows = (
  patients: Patient[],
  sputumFollowUps: SputumFollowUp[],
  selectedMonth = toLocalIsoMonth(),
): MonthlyFollowUpRow[] =>
  patients
    .filter(isActivePatient)
    .map((patient) => {
      const schedule = resolvePatientTreatmentSchedule(patient);
      const stages = FOLLOW_UP_STAGES.reduce<Record<FollowUpStage, StageSummary>>((acc, stage) => {
        acc[stage] = createStageSummary(patient, sputumFollowUps, stage, schedule.sputumDueDates?.[stage]);
        return acc;
      }, {} as Record<FollowUpStage, StageSummary>);
      const dueThisMonth = Object.values(stages).some((stage) => stage.required && stage.dueDate.startsWith(selectedMonth));
      return {
        patientId: patient.id,
        serial: 0,
        name: patient.name || notRecorded,
        age: valueOrMissing(patient.age),
        tr: patient.tr || notRecorded,
        address: patientAddress(patient),
        mobile: patient.phone || notRecorded,
        dotName: patient.dotProviderName || patient.ssName || "",
        dotPhone: patient.ssPhone || "",
        location: patientLocationLabel(patient),
        treatmentStartDate: patient.treatmentStartDate || "",
        patientTypeAndTbType: [patient.patientType, patient.tbType, patient.confirmationMethod].filter(Boolean).join(" / ") || notRecorded,
        tbType: patient.tbType || "",
        confirmationMethod: patient.confirmationMethod || "",
        hasDrugStart: Boolean(patient.drugStartDate),
        dueThisMonth,
        stages,
      };
    })
    .sort((a, b) => a.location.localeCompare(b.location) || a.tr.localeCompare(b.tr) || a.name.localeCompare(b.name))
    .map((row, index) => ({ ...row, serial: index + 1 }));

const stageCsvValue = (row: MonthlyFollowUpRow, stage: FollowUpStage) => row.stages[stage].dueLabel;

const combineStageValues = (row: MonthlyFollowUpRow, field: keyof Pick<StageSummary, "testLabel" | "labId" | "result" | "weight" | "comment">) =>
  FOLLOW_UP_STAGES
    .map((stage) => {
      const summary = row.stages[stage];
      if (!summary.required) return "";
      const value = summary[field] || (field === "weight" ? notRecorded : "Pending");
      return value ? `${stage}: ${value}` : "";
    })
    .filter(Boolean)
    .join("; ") || "Not required";

export const monthlyFollowUpRowsToCsvRows = (rows: MonthlyFollowUpRow[]) =>
  rows.map((row) => ({
    Serial: row.serial,
    "Patient name": row.name,
    Age: row.age,
    "TR No": row.tr,
    Address: row.address,
    "Mobile number": row.mobile,
    "Treatment start date": formatDateDisplay(row.treatmentStartDate) || "",
    "Patient type / TB type": row.patientTypeAndTbType,
    "2M probable date": stageCsvValue(row, "2M"),
    "5M probable date": stageCsvValue(row, "5M"),
    "6M probable date": stageCsvValue(row, "6M"),
    "Actual sputum test date": combineStageValues(row, "testLabel"),
    "Lab No": combineStageValues(row, "labId"),
    Result: combineStageValues(row, "result"),
    Weight: combineStageValues(row, "weight"),
    Comment: combineStageValues(row, "comment"),
  }));

const downloadCsv = (name: string, rows: Record<string, unknown>[]) => {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
};

const formatSelectedMonth = (monthKey: string) => {
  const [year, month] = monthKey.split("-");
  return { month: month || "", year: year || "", label: monthKey };
};

const textForSearch = (row: MonthlyFollowUpRow) =>
  [row.name, row.tr, row.mobile, row.dotName, row.dotPhone, row.address, row.location, row.patientTypeAndTbType].join(" ").toLowerCase();

export function MonthlyFollowUpPage({ patients, sputumFollowUps }: { patients: Patient[]; sputumFollowUps: SputumFollowUp[] }) {
  const [selectedMonth, setSelectedMonth] = useState(() => toLocalIsoMonth());
  const [locationFilter, setLocationFilter] = useState("All locations");
  const [search, setSearch] = useState("");
  const monthInfo = formatSelectedMonth(selectedMonth);
  const rows = useMemo(() => deriveMonthlyFollowUpRows(patients, sputumFollowUps, selectedMonth), [patients, sputumFollowUps, selectedMonth]);
  const locations = useMemo(() => ["All locations", ...Array.from(new Set(rows.map((row) => row.location))).sort()], [rows]);
  const visibleRows = rows.filter((row) => {
    const matchesLocation = locationFilter === "All locations" || row.location === locationFilter;
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || textForSearch(row).includes(q);
    return matchesLocation && matchesSearch;
  });
  const sheetRows = visibleRows.filter((row) => row.hasDrugStart);
  const missingDrugStartRows = visibleRows.filter((row) => !row.hasDrugStart);

  const handleExport = () => downloadCsv(`monthly-follow-up-${selectedMonth}.csv`, monthlyFollowUpRowsToCsvRows(visibleRows));

  return (
    <div className="monthly-followup-page">
      <PageHeader
        title="Monthly Follow-up"
        subtitle="মাসিক কফ পরীক্ষা follow-up sheet"
        action={(
          <>
            <button className="ghost-button" type="button" onClick={() => window.print()}><Printer size={16} /> Print</button>
            <button className="primary-button" type="button" onClick={handleExport}><Download size={16} /> CSV Export</button>
          </>
        )}
      />

      <SectionCard title="Sheet controls" tone="info">
        <div className="followup-filter-grid">
          <label>
            Month
            <input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value || toLocalIsoMonth())} />
          </label>
          <label>
            Location
            <select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)}>
              {locations.map((location) => <option key={location} value={location}>{location}</option>)}
            </select>
          </label>
          <label className="followup-search">
            Search
            <span className="search-box compact-search"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, TR, phone, DOT/SS" /></span>
          </label>
        </div>
        <div className="followup-control-summary">
          <StatusBadge tone="info">{visibleRows.length} active patients</StatusBadge>
          <StatusBadge tone="success">{sheetRows.length} ready rows</StatusBadge>
          {missingDrugStartRows.length ? <StatusBadge tone="warning">{missingDrugStartRows.length} drug start needed</StatusBadge> : null}
        </div>
      </SectionCard>

      {missingDrugStartRows.length ? (
        <SectionCard title="Drug start needed" tone="warning">
          <p className="empty-copy">These active pulmonary patients are kept on the sheet, but 2M/5M/6M dates need Drug start date first.</p>
          <div className="followup-warning-list">
            {missingDrugStartRows.map((row) => (
              <article key={row.patientId}>
                <strong>{row.tr} - {row.name}</strong>
                <span>{row.mobile} · {row.location}</span>
              </article>
            ))}
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title="Monthly follow-up sheet" tone="success">
        <div className="monthly-followup-print-head">
          <h3>ব্র্যাক স্বাস্থ্য কর্মসূচি</h3>
          <p>যক্ষ্মা নিয়ন্ত্রণ প্রকল্প</p>
          <h4>চলমান যক্ষ্মা রোগীর মাসিক ফলোআপ কফ পরীক্ষার সিডিউল</h4>
          <div className="followup-paper-meta">
            <span>কর্মীর নাম : ____________________</span>
            <span>শাখা : ____________________</span>
            <span>মাস : {monthInfo.month}</span>
            <span>বছর : {monthInfo.year}</span>
          </div>
        </div>

        <div className="monthly-followup-mobile-list" aria-label="Monthly follow-up mobile cards">
          {visibleRows.map((row) => (
            <article className="monthly-followup-card" key={row.patientId}>
              <div>
                <strong>{row.serial}. {row.name}</strong>
                <StatusBadge tone={row.dueThisMonth ? "warning" : row.tbType === "Extra-pulmonary" ? "purple" : "info"}>
                  {row.tbType === "Extra-pulmonary" ? "EP" : row.dueThisMonth ? "Due this month" : "Active"}
                </StatusBadge>
              </div>
              <p>TR {row.tr} · Age {row.age} · {row.mobile}</p>
              <p>{row.address}</p>
              <div className="monthly-card-stage-grid">
                {FOLLOW_UP_STAGES.map((stage) => (
                  <span key={stage}><b>{stage}</b>{row.stages[stage].dueLabel}</span>
                ))}
              </div>
              <small>{combineStageValues(row, "result")}</small>
            </article>
          ))}
        </div>

        <div className="monthly-followup-table-wrap">
          <table className="monthly-followup-table">
            <thead>
              <tr>
                <th rowSpan={2}>ক্রমিক নং</th>
                <th rowSpan={2}>রোগীর নাম</th>
                <th rowSpan={2}>বয়স</th>
                <th rowSpan={2}>TR No</th>
                <th rowSpan={2}>ঠিকানা</th>
                <th rowSpan={2}>মোবাইল নম্বর</th>
                <th rowSpan={2}>চিকিৎসা শুরুর তারিখ</th>
                <th rowSpan={2}>রোগীর ধরন</th>
                <th colSpan={3}>সম্ভাব্য ফলোআপ কফ পরীক্ষার তারিখ</th>
                <th rowSpan={2}>প্রকৃত কফ পরীক্ষার তারিখ</th>
                <th rowSpan={2}>ল্যাব নং</th>
                <th rowSpan={2}>ফলাফল</th>
                <th rowSpan={2}>ওজন</th>
                <th rowSpan={2}>মন্তব্য</th>
              </tr>
              <tr>
                <th>২ মাস</th>
                <th>৫ মাস</th>
                <th>৬ মাস</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.length ? visibleRows.map((row) => (
                <tr key={row.patientId} className={row.dueThisMonth ? "due-this-month" : ""}>
                  <td>{row.serial}</td>
                  <td>{row.name}</td>
                  <td>{row.age}</td>
                  <td>{row.tr}</td>
                  <td>{row.address}</td>
                  <td>{row.mobile}</td>
                  <td>{formatDateDisplay(row.treatmentStartDate) || notRecorded}</td>
                  <td>{row.patientTypeAndTbType}</td>
                  <td>{row.stages["2M"].dueLabel}</td>
                  <td>{row.stages["5M"].dueLabel}</td>
                  <td>{row.stages["6M"].dueLabel}</td>
                  <td>{combineStageValues(row, "testLabel")}</td>
                  <td>{combineStageValues(row, "labId")}</td>
                  <td>{combineStageValues(row, "result")}</td>
                  <td>{combineStageValues(row, "weight")}</td>
                  <td>{combineStageValues(row, "comment")}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={16}>No active patients match this sheet filter.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
