import { Activity, BarChart3, ClipboardList, FlaskConical, ListChecks, Plus, ShieldAlert, Stethoscope, UserPlus, Users } from "lucide-react";
import type { AppData } from "./types";
import { AlertCard, DiaryTimeline, PageHeader, SectionCard, StatCard, StatusBadge, WorklistItem } from "../components";
import { formatDateDisplay, toLocalIsoDate } from "../lib/dateFormat";

export function DashboardPage({ data, onNavigate }: { data: AppData; onNavigate: (path: string) => void }) {
  const active = data.patients.filter((p) => !p.outcome && p.phase !== "Pre-treatment").length;
  const preTreatment = data.patients.filter((p) => p.phase === "Pre-treatment").length;
  const completed = data.patients.filter((p) => p.outcome).length;
  const critical = data.tasks.filter((t) => t.priority === "Critical").length;
  const todayDiary = data.diary.filter((d) => d.date === toLocalIsoDate()).length;
  const missedDot = data.dotEntries.filter((d) => d.status === "missed").length;
  const ciPending = data.tasks.filter((t) => t.type === "CI_PENDING").length;
  const tptActive = data.tptRecords.filter((t) => t.status === "Active").length;

  const criticalTasks = data.tasks.filter((t) => t.priority === "Critical");
  const highTasks = data.tasks.filter((t) => t.priority === "High");

  return (
    <>
      <PageHeader title="ড্যাশবোর্ড" subtitle={`${formatDateDisplay(toLocalIsoDate())} - আজকের field operation summary`} />

      <div className="stat-grid">
        <StatCard label="মোট রোগী" value={data.patients.length} tone="success" icon={<Users size={18} />} />
        <StatCard label="চলমান চিকিৎসা" value={active} tone="info" icon={<Activity size={18} />} />
        <StatCard label="Pre-treatment" value={preTreatment} tone="warning" icon={<Stethoscope size={18} />} />
        <StatCard label="চিকিৎসা শেষ" value={completed} tone="success" icon={<UserPlus size={18} />} />
        <StatCard label="আজকের কাজ" value={data.tasks.length} tone="warning" icon={<ListChecks size={18} />} />
        <StatCard label="Critical Alert" value={critical} tone="danger" icon={<ShieldAlert size={18} />} />
        <StatCard label="DOT Missed" value={missedDot} tone="danger" icon={<ClipboardList size={18} />} />
        <StatCard label="CI Pending" value={ciPending} tone="purple" icon={<FlaskConical size={18} />} />
        <StatCard label="TPT Active" value={tptActive} tone="info" icon={<BarChart3 size={18} />} />
      </div>

      {criticalTasks.length > 0 && (
        <SectionCard title="🚨 Critical Alerts" tone="danger">
          <div className="stack">
            {criticalTasks.slice(0, 5).map((t) => (
              <AlertCard key={t.id} message={`${t.title}: ${t.description || ""}`} level="critical" />
            ))}
          </div>
        </SectionCard>
      )}

      <div className="content-grid">
        <SectionCard title="আজকের কাজ (Worklist Preview)" tone="warning" action={<button className="ghost-button" type="button" onClick={() => onNavigate("/today")}>সব দেখুন</button>}>
          <div className="stack">
            {data.tasks.slice(0, 5).map((t) => (
              <WorklistItem key={t.id} task={t} patient={data.patients.find((p) => p.id === t.patientId)} onOpen={t.patientId ? () => onNavigate(`/patients/${t.patientId}`) : undefined} />
            ))}
            {data.tasks.length === 0 && <p style={{ color: "var(--muted)" }}>আজ কোনো কাজ বাকি নেই ✓</p>}
          </div>
        </SectionCard>

        <SectionCard title="সাম্প্রতিক FO Diary" tone="info" action={<button className="ghost-button" type="button" onClick={() => onNavigate("/diary")}>সব দেখুন</button>}>
          <DiaryTimeline entries={data.diary.slice(0, 5)} />
          <small style={{ color: "var(--muted)" }}>আজ {todayDiary}টি কাজ রেকর্ড হয়েছে</small>
        </SectionCard>
      </div>

      <SectionCard title="দ্রুত কাজ (Quick Actions)" tone="success">
        <div className="quick-actions">
          <button className="quick-btn" type="button" onClick={() => onNavigate("/patients/new")}><Plus size={18} /> নতুন রোগী</button>
          <button className="quick-btn" type="button" onClick={() => onNavigate("/today?filter=DOT")}><ClipboardList size={18} /> DOT Update</button>
          <button className="quick-btn" type="button" onClick={() => onNavigate("/today?filter=Lab")}><FlaskConical size={18} /> Lab Result</button>
          <button className="quick-btn" type="button" onClick={() => onNavigate("/today?filter=CI%2FTPT")}><Users size={18} /> CI / TPT</button>
          <button className="quick-btn" type="button" onClick={() => onNavigate("/today?filter=Outcome")}><ListChecks size={18} /> Outcome</button>
          <button className="quick-btn" type="button" onClick={() => onNavigate("/reports")}><BarChart3 size={18} /> Export Report</button>
        </div>
      </SectionCard>

      {highTasks.length > 0 && (
        <SectionCard title="High Priority Tasks" tone="warning">
          <div className="stack">
            {highTasks.slice(0, 4).map((t) => (
              <WorklistItem key={t.id} task={t} patient={data.patients.find((p) => p.id === t.patientId)} onOpen={t.patientId ? () => onNavigate(`/patients/${t.patientId}`) : undefined} />
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard title="Phase Distribution" tone="info">
        <div className="stat-grid">
          <StatCard label="Pre-treatment" value={preTreatment} tone="warning" />
          <StatCard label="Intensive" value={data.patients.filter((p) => p.phase === "Intensive Phase").length} tone="info" />
          <StatCard label="Continuation" value={data.patients.filter((p) => p.phase === "Continuation Phase").length} tone="success" />
          <StatCard label="Completed" value={completed} tone="success" />
        </div>
        <div className="badge-row" style={{ marginTop: 10 }}>
          {["Cured", "Treatment Completed", "Died", "Lost to Follow-up", "Transfer Out"].map((o) => {
            const c = data.patients.filter((p) => p.outcome === o).length;
            return c ? <StatusBadge key={o} tone={o === "Died" || o === "Lost to Follow-up" ? "danger" : "success"}>{o}: {c}</StatusBadge> : null;
          })}
        </div>
      </SectionCard>
    </>
  );
}
