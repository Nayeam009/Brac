import { useState } from "react";
import { Download, Upload } from "lucide-react";
import type { AppData } from "./types";
import { PageHeader, SectionCard } from "../components";

const downloadJson = (name: string, val: unknown) => { const b = new Blob([JSON.stringify(val, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; a.click(); URL.revokeObjectURL(a.href); };

const SETTINGS_KEY = "tb-fo-settings";

type AppSettings = {
  defaultDistrict: string;
  defaultUpazila: string;
  defaultDotsCenter: string;
  foName: string;
};

const loadSettings = (): AppSettings => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { defaultDistrict: "মুন্সিগঞ্জ", defaultUpazila: "সিরাজদিখান", defaultDotsCenter: "Sirajdikha UHC", foName: "Field Organiser" };
};

const saveSettings = (settings: AppSettings) => {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
};

export function SettingsPage({ data, onToast, onRestoreBackup }: { data: AppData; onToast: (msg: string, tone?: "success" | "error" | "warning") => void; onRestoreBackup: (rawBackup: unknown) => Promise<{ restoredPatients: number; warnings: string[] }> }) {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);

  const updateSetting = (key: keyof AppSettings, value: string) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    saveSettings(updated);
  };

  const handleImport = () => {
    const input = document.createElement("input"); input.type = "file"; input.accept = ".json";
    input.onchange = () => {
      const file = input.files?.[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result as string);
          if (!parsed.patients || !Array.isArray(parsed.patients)) { onToast("Invalid backup file format.", "error"); return; }
          if (!window.confirm(`Restore ${parsed.patients.length} patients from this backup? Existing matching records will be updated, not deleted.`)) return;
          onRestoreBackup(parsed)
            .then((result) => {
              const warningText = result.warnings.length ? ` ${result.warnings.join(" ")}` : "";
              onToast(`Backup restored: ${result.restoredPatients} imported patients.${warningText}`, result.warnings.length ? "warning" : "success");
            })
            .catch((error) => onToast(error instanceof Error ? error.message : "Backup restore failed.", "error"));
        } catch { onToast("JSON parse error. ফাইলটি সঠিক নয়।", "error"); }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return (
    <>
      <PageHeader title="Backup & Settings" subtitle="Sensitive patient data নিরাপদে export করুন" />
      <div className="content-grid">
        <SectionCard title="Data Backup" tone="info">
          <div className="action-row">
            <button type="button" onClick={() => { downloadJson("tb-fo-backup.json", data); onToast("Full backup export হয়েছে"); }}><Download size={16} /> Full Backup (JSON)</button>
            <button type="button" onClick={handleImport}><Upload size={16} /> Import Backup</button>
          </div>
          <div style={{ marginTop: 14 }}>
            <p style={{ color: "var(--muted)", fontSize: 14 }}>মোট রেকর্ড: {data.patients.length} রোগী, {data.dotEntries.length} DOT, {data.labResults.length} lab, {data.contacts.length} CI, {data.tptRecords.length} TPT</p>
          </div>
          <p className="warning-note">⚠ এই ফাইলে সংবেদনশীল রোগীর তথ্য আছে। শুধু অনুমোদিত ডিভাইসে রাখুন।</p>
        </SectionCard>
        <SectionCard title="App Settings" tone="success">
          <div className="field-grid one">
            <label>Default District<input value={settings.defaultDistrict} onChange={(e) => updateSetting("defaultDistrict", e.target.value)} /></label>
            <label>Default Upazila<input value={settings.defaultUpazila} onChange={(e) => updateSetting("defaultUpazila", e.target.value)} /></label>
            <label>Default DOTS Centre<input value={settings.defaultDotsCenter} onChange={(e) => updateSetting("defaultDotsCenter", e.target.value)} /></label>
            <label>FO Name<input value={settings.foName} onChange={(e) => updateSetting("foName", e.target.value)} /></label>
          </div>
          <small style={{ color: "var(--muted)", marginTop: 8, display: "block" }}>পরিবর্তন স্বয়ংক্রিয়ভাবে সংরক্ষিত হয়।</small>
        </SectionCard>
      </div>
      <SectionCard title="অ্যাপ সম্পর্কে" tone="neutral">
        <p style={{ color: "var(--muted)" }}>TB-FO Assistant v1.0 — BRAC TB Programme</p>
        <p style={{ color: "var(--muted)" }}>Offline-first PWA। সকল data IndexedDB / localStorage-এ সংরক্ষিত।</p>
        <p style={{ color: "var(--muted)" }}>InsForge backend connected হলে cloud sync হবে।</p>
      </SectionCard>
    </>
  );
}
