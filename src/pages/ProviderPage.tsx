import { useState } from "react";
import { Phone, Plus } from "lucide-react";
import type { Patient, Provider } from "../domain/types";
import { PageHeader, SearchBox, SectionCard, StatCard, StatusBadge } from "../components";

export function ProviderPage({ providers, patients, onSave }: { providers: Provider[]; patients: Patient[]; onSave: (p: Provider) => void }) {
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<Provider>>({ type: "SS" });

  const filtered = providers.filter((p) => !query || [p.name, p.phone, p.area, p.union].join(" ").toLowerCase().includes(query.toLowerCase()));
  const assignedMap = new Map<string, number>();
  for (const p of patients) { if (p.ssName) assignedMap.set(p.ssName, (assignedMap.get(p.ssName) || 0) + 1); }

  return (
    <>
      <PageHeader title="SS / DOT Provider" subtitle="Provider তালিকা ও কর্মক্ষমতা" action={<button className="primary-action" type="button" onClick={() => setShowForm(!showForm)}><Plus size={16} /> Provider</button>} />
      <div className="stat-grid">
        <StatCard label="মোট Provider" value={providers.length} tone="success" />
        <StatCard label="SS" value={providers.filter((p) => p.type === "SS").length} tone="info" />
        <StatCard label="Community" value={providers.filter((p) => p.type === "Community").length} tone="purple" />
        <StatCard label="Assigned Patients" value={patients.filter((p) => p.ssName).length} tone="warning" />
      </div>
      <div className="toolbar"><SearchBox value={query} onChange={setQuery} placeholder="নাম, ফোন, বা এলাকা দিয়ে খুঁজুন" /></div>

      {showForm && (
        <SectionCard title="নতুন Provider" tone="info">
          <div className="field-grid">
            <label>নাম<input value={form.name || ""} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} /></label>
            <label>Type<select value={form.type || "SS"} onChange={(e) => setForm((c) => ({ ...c, type: e.target.value as Provider["type"] }))}><option>SS</option><option>Community</option><option>Health Worker</option><option>Family</option></select></label>
            <label>মোবাইল<input value={form.phone || ""} onChange={(e) => setForm((c) => ({ ...c, phone: e.target.value }))} /></label>
            <label>এলাকা<input value={form.area || ""} onChange={(e) => setForm((c) => ({ ...c, area: e.target.value }))} /></label>
            <label>ইউনিয়ন<input value={form.union || ""} onChange={(e) => setForm((c) => ({ ...c, union: e.target.value }))} /></label>
            <label>ওয়ার্ড<input value={form.ward || ""} onChange={(e) => setForm((c) => ({ ...c, ward: e.target.value }))} /></label>
          </div>
          <button className="primary-action" type="button" style={{ marginTop: 14 }} onClick={() => {
            if (!form.name) return;
            onSave({ id: "", name: form.name, type: form.type || "SS", phone: form.phone, area: form.area, union: form.union, ward: form.ward, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as Provider);
            setForm({ type: "SS" }); setShowForm(false);
          }}>সংরক্ষণ</button>
        </SectionCard>
      )}

      <div className="table-list">
        {filtered.map((p) => {
          const assigned = assignedMap.get(p.name) || 0;
          return (
            <article key={p.id} className="table-row">
              <div style={{ minWidth: 0 }}><strong>{p.name}</strong><br /><small style={{ color: "var(--muted)" }}>{p.area || p.union || "Area নেই"}</small></div>
              <div className="badge-row">
                <StatusBadge tone="info">{p.type}</StatusBadge>
                <StatusBadge tone={assigned > 0 ? "success" : "neutral"}>{assigned} রোগী</StatusBadge>
              </div>
              <span>{p.phone ? <a href={`tel:${p.phone}`} style={{ display: "inline-flex", gap: 4, alignItems: "center", color: "var(--g)" }}><Phone size={14} />{p.phone}</a> : "ফোন নেই"}</span>
            </article>
          );
        })}
      </div>
    </>
  );
}
