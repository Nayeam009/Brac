import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Patient, Task } from "../domain/types";
import { PageHeader, StatusBadge, WorklistItem } from "../components";

export function WorklistPage({ tasks, patients, onOpen }: { tasks: Task[]; patients: Patient[]; onOpen: (id: string) => void }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState(searchParams.get("filter") || "");
  useEffect(() => { setFilter(searchParams.get("filter") || ""); }, [searchParams]);
  const chooseFilter = (value: string) => {
    setFilter(value);
    setSearchParams(value ? { filter: value } : {});
  };
  const filtered = filter ? tasks.filter((t) => filter === "Critical" ? t.priority === "Critical" : filter === "Overdue" ? t.type?.includes("OVERDUE") : filter === "DOT" ? t.type === "DOT_MISSED" || t.type === "DOT_NOT_UPDATED" : filter === "Lab" ? t.type?.includes("TREATMENT_START") || t.type?.includes("DR_TB") : filter === "CI/TPT" ? t.type === "CI_PENDING" || t.type === "TPT_DUE" : filter === "Outcome" ? t.type === "OUTCOME_PENDING" : true) : tasks;
  const critical = tasks.filter((t) => t.priority === "Critical").length;
  const high = tasks.filter((t) => t.priority === "High").length;

  return (
    <>
      <PageHeader title="আজকের কাজ" subtitle={`আজ ${tasks.length}টি কাজ বাকি`} action={<div className="badge-row"><StatusBadge tone="danger">Critical: {critical}</StatusBadge><StatusBadge tone="warning">High: {high}</StatusBadge></div>} />
      <div className="chip-group" style={{ marginBottom: 16 }}>
        {["", "Critical", "Overdue", "DOT", "Lab", "CI/TPT", "Outcome"].map((f) => (
          <button key={f} className={`chip ${filter === f ? "selected" : ""}`} type="button" onClick={() => chooseFilter(f)}>{f || "সব কাজ"}</button>
        ))}
      </div>
      <div className="stack">
        {filtered.length === 0 ? <div className="empty-state"><p>এই ফিল্টারে কোনো কাজ নেই ✓</p></div> : filtered.map((t) => {
          const p = patients.find((x) => x.id === t.patientId);
          return <WorklistItem key={t.id} task={t} patient={p} onOpen={p ? () => onOpen(p.id) : undefined} />;
        })}
      </div>
    </>
  );
}
