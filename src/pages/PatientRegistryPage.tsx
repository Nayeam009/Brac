import { useState } from "react";
import type { Patient, Task } from "../domain/types";
import { PageHeader, PatientCard, SearchBox, StatusBadge } from "../components";

export function PatientRegistryPage({ patients, tasks, onOpen }: { patients: Patient[]; tasks: Task[]; onOpen: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [phaseFilter, setPhaseFilter] = useState("");
  const [tbFilter, setTbFilter] = useState("");

  const filtered = patients.filter((p) => {
    if (query && ![p.name, p.tr, p.phone, p.ssName, p.union].join(" ").toLowerCase().includes(query.toLowerCase())) return false;
    if (phaseFilter && (phaseFilter === "Outcome" ? !p.outcome : p.phase !== phaseFilter || p.outcome)) return false;
    if (tbFilter && p.tbType !== tbFilter) return false;
    return true;
  });

  return (
    <>
      <PageHeader title="সকল রোগী" subtitle="TR, নাম, SS বা ফোন নম্বর দিয়ে খুঁজুন" action={<StatusBadge tone="info">{filtered.length} জন</StatusBadge>} />
      <div className="toolbar">
        <SearchBox value={query} onChange={setQuery} placeholder="TR নং, নাম, SS নাম, বা ফোন নম্বর" />
      </div>
      <div className="filter-row">
        <select value={phaseFilter} onChange={(e) => setPhaseFilter(e.target.value)} aria-label="Phase filter">
          <option value="">সব Phase</option>
          <option>Pre-treatment</option>
          <option>Intensive Phase</option>
          <option>Continuation Phase</option>
          <option>Completed</option>
          <option value="Outcome">Outcome Recorded</option>
        </select>
        <select value={tbFilter} onChange={(e) => setTbFilter(e.target.value)} aria-label="TB Type filter">
          <option value="">সব TB Type</option>
          <option>Pulmonary</option>
          <option>Extra-pulmonary</option>
        </select>
      </div>
      <div className="patient-list">
        {filtered.length === 0 ? (
          <div className="empty-state"><p>কোনো রোগী পাওয়া যায়নি। নতুন রোগী নিবন্ধন করুন।</p></div>
        ) : filtered.map((p) => (
          <PatientCard key={p.id} patient={p} tasks={tasks} onOpen={() => onOpen(p.id)} />
        ))}
      </div>
    </>
  );
}
