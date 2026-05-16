import type { LabResult, Patient, SputumFollowUp, Task } from "../domain/types";
import { detectDataQualityIssues } from "../domain/automation";
import { PageHeader, SectionCard, StatCard, StatusBadge } from "../components";

export function DataQualityPage({ patients, labResults, sputumFollowUps = [], tasks, onOpen }: { patients: Patient[]; labResults: LabResult[]; sputumFollowUps?: SputumFollowUp[]; tasks: Task[]; onOpen: (id: string) => void }) {
  const issues = detectDataQualityIssues(patients, labResults, sputumFollowUps);
  const high = issues.filter((i) => i.severity === "high");
  const medium = issues.filter((i) => i.severity === "medium");
  const low = issues.filter((i) => i.severity === "low");

  return (
    <>
      <PageHeader title="Data Quality Check" subtitle="অসম্পূর্ণ বা ঝুঁকিপূর্ণ রেকর্ড দ্রুত ঠিক করুন" />
      <div className="stat-grid">
        <StatCard label="High Severity" value={high.length} tone="danger" />
        <StatCard label="Medium Severity" value={medium.length} tone="warning" />
        <StatCard label="Low Severity" value={low.length} tone="info" />
        <StatCard label="Open Tasks" value={tasks.length} tone="warning" />
      </div>
      {high.length > 0 && (
        <SectionCard title="🚨 High Severity Issues" tone="danger">
          <div className="stack">
            {high.map((i, idx) => (
              <button key={idx} className="patient-card urgent" type="button" onClick={() => onOpen(i.patient.id)} style={{ width: "100%" }}>
                <div className="patient-main">
                  <div className="patient-title"><strong>{i.patient.name}</strong><StatusBadge tone="danger">{i.issue}</StatusBadge></div>
                  <p>TR: {i.patient.tr || "—"} · Phase: {i.patient.phase || "—"}</p>
                </div>
              </button>
            ))}
          </div>
        </SectionCard>
      )}
      {medium.length > 0 && (
        <SectionCard title="⚠ Medium Severity Issues" tone="warning">
          <div className="stack">
            {medium.map((i, idx) => (
              <button key={idx} className="patient-card" type="button" onClick={() => onOpen(i.patient.id)} style={{ width: "100%" }}>
                <div className="patient-main">
                  <div className="patient-title"><strong>{i.patient.name}</strong><StatusBadge tone="warning">{i.issue}</StatusBadge></div>
                  <p>TR: {i.patient.tr || "—"}</p>
                </div>
              </button>
            ))}
          </div>
        </SectionCard>
      )}
      {issues.length === 0 && (
        <SectionCard title="✓ All Clear" tone="success">
          <div className="empty-state"><p>বড় কোনো data quality issue নেই। চমৎকার!</p></div>
        </SectionCard>
      )}
    </>
  );
}
