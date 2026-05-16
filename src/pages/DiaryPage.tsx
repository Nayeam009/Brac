import { useState } from "react";
import { FileDown } from "lucide-react";
import type { DiaryEntry } from "../domain/types";
import { AlertCard, DateInput, DiaryTimeline, DownloadButton, PageHeader, SectionCard, SearchBox, StatCard, StatusBadge } from "../components";
import { formatDateDisplay, formatDateTimeDisplay, toLocalIsoDate } from "../lib/dateFormat";

const downloadJson = (filename: string, value: unknown) => { const b = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = filename; a.click(); URL.revokeObjectURL(a.href); };

const formatDiaryExport = (diary: DiaryEntry[]) => diary.map((entry) => ({
  ...entry,
  date: formatDateDisplay(entry.date) || entry.date,
  time: formatDateTimeDisplay(entry.time) || entry.time,
}));

export function DiaryPage({ diary, diaryTrackingEnabled = true, onDiaryTrackingChange }: { diary: DiaryEntry[]; diaryTrackingEnabled?: boolean; onDiaryTrackingChange?: (enabled: boolean) => void }) {
  const [type, setType] = useState("");
  const [query, setQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  const filtered = diary.filter((e) => {
    if (type && e.type !== type) return false;
    if (dateFilter && e.date !== dateFilter) return false;
    if (query && ![e.details, e.patientName, e.tr, e.userName].join(" ").toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  const todayCount = diary.filter((e) => e.date === toLocalIsoDate()).length;
  const types = ["New Patient", "DOT Updated", "Lab Updated", "CI Updated", "TPT Updated", "Outcome Updated", "Sputum Updated", "Record Updated", "Report Generated", "Delete"];
  const typeCounts = types.map((t) => ({ type: t, count: diary.filter((e) => e.type === t).length }));

  return (
    <>
      <PageHeader title="FO দৈনিক কাজের ডায়েরি" subtitle="Patient update summaries with full audit export" action={<DownloadButton onClick={() => downloadJson("fo-diary.json", formatDiaryExport(diary))}>Diary Export</DownloadButton>} />
      <section className={`diary-tracking-card ${diaryTrackingEnabled ? "" : "paused"}`} aria-label="Diary tracking control">
        <div>
          <strong>Diary tracking</strong>
          <p>{diaryTrackingEnabled ? "On - updates are tracked" : "Off - data saves without diary logging"}</p>
        </div>
        <label className="diary-toggle">
          <input
            type="checkbox"
            aria-label="Diary tracking"
            checked={diaryTrackingEnabled}
            onChange={(event) => onDiaryTrackingChange?.(event.target.checked)}
          />
          <span>{diaryTrackingEnabled ? "On" : "Off"}</span>
        </label>
      </section>
      {!diaryTrackingEnabled ? <AlertCard level="medium" message="Previous data entry mode: patient updates will save, but diary tracking is paused." /> : null}
      <div className="stat-grid">
        <StatCard label="মোট আপডেট" value={diary.length} tone="info" />
        <StatCard label="আজকের আপডেট" value={todayCount} tone="success" />
        {typeCounts.filter((t) => t.count > 0).slice(0, 2).map((t) => (
          <StatCard key={t.type} label={t.type} value={t.count} tone="neutral" />
        ))}
      </div>
      <div className="toolbar">
        <SearchBox value={query} onChange={setQuery} placeholder="রোগীর নাম, TR, বা কাজের বিবরণ" />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">সব কাজ</option>
          {types.map((t) => <option key={t}>{t}</option>)}
        </select>
        <DateInput value={dateFilter} onChange={setDateFilter} style={{ minHeight: 40, border: "1px solid var(--border)", borderRadius: 12, padding: "0 12px", width: "100%" }} />
        <StatusBadge tone="info">{filtered.length} update</StatusBadge>
      </div>
      <SectionCard title="Daily Update Summary" tone="info">
        {filtered.length === 0 ? <p style={{ color: "var(--muted)" }}>ফিল্টার অনুযায়ী কোনো update নেই।</p> : <DiaryTimeline entries={filtered} />}
      </SectionCard>
    </>
  );
}
