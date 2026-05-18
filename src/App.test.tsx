import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { AppData } from "./services/appRepository";
import type { Patient, Profile } from "./domain/types";

const mocks = vi.hoisted(() => ({
  loadAuthGate: vi.fn(),
  signOut: vi.fn(),
  signInAndLoadProfile: vi.fn(),
  requestAccess: vi.fn(),
  verifyEmailAndLoadProfile: vi.fn(),
  resendVerificationEmail: vi.fn(),
  loadAppData: vi.fn(),
  savePatient: vi.fn(),
  saveDotEntry: vi.fn(),
  saveDiaryEntry: vi.fn(),
  saveLabResult: vi.fn(),
  deleteLabResult: vi.fn(),
  saveContact: vi.fn(),
  saveTptRecord: vi.fn(),
  saveSputumFollowUp: vi.fn(),
  saveProvider: vi.fn(),
  restoreAppData: vi.fn(),
  deletePatientWithCleanup: vi.fn(),
  uploadRecordAttachment: vi.fn(),
  saveRecordAttachment: vi.fn(),
  openRecordAttachment: vi.fn(),
}));

vi.mock("./lib/insforgeClient", () => ({ insforgeConfigError: "" }));

vi.mock("./services/authService", () => ({
  loadAuthGate: mocks.loadAuthGate,
  signOut: mocks.signOut,
  signInAndLoadProfile: mocks.signInAndLoadProfile,
  requestAccess: mocks.requestAccess,
  verifyEmailAndLoadProfile: mocks.verifyEmailAndLoadProfile,
  resendVerificationEmail: mocks.resendVerificationEmail,
}));

vi.mock("./services/appRepository", () => ({
  loadAppData: mocks.loadAppData,
  savePatient: mocks.savePatient,
  saveDotEntry: mocks.saveDotEntry,
  saveDiaryEntry: mocks.saveDiaryEntry,
  saveLabResult: mocks.saveLabResult,
  deleteLabResult: mocks.deleteLabResult,
  saveContact: mocks.saveContact,
  saveTptRecord: mocks.saveTptRecord,
  saveSputumFollowUp: mocks.saveSputumFollowUp,
  saveProvider: mocks.saveProvider,
  restoreAppData: mocks.restoreAppData,
  deletePatientWithCleanup: mocks.deletePatientWithCleanup,
  uploadRecordAttachment: mocks.uploadRecordAttachment,
  saveRecordAttachment: mocks.saveRecordAttachment,
  openRecordAttachment: mocks.openRecordAttachment,
}));

const profile: Profile = {
  id: "profile-1",
  userId: "user-1",
  name: "FO Test",
  email: "fo@example.com",
  role: "fo",
  status: "active",
  createdAt: "2026-05-15T00:00:00.000Z",
  updatedAt: "2026-05-15T00:00:00.000Z",
};

const patient: Patient = {
  id: "patient-1",
  name: "QA Patient",
  tr: "QA-001",
  tbType: "Pulmonary",
  confirmationMethod: "BC",
  phase: "Intensive Phase",
  treatmentStartDate: "2026-05-01",
  drugStartDate: "2026-05-01",
  treatmentEndDate: "2026-10-27",
  regimenType: "CAT-1 / 4FDC",
  weightKg: 40,
  createdAt: "2026-05-15T00:00:00.000Z",
  updatedAt: "2026-05-15T00:00:00.000Z",
};

const appData = (overrides: Partial<AppData> = {}): AppData => ({
  patients: [patient],
  labResults: [],
  dotEntries: [],
  contacts: [],
  tptRecords: [],
  sputumFollowUps: [],
  diaryEntries: [],
  tasks: [],
  providers: [],
  attachments: [],
  ...overrides,
});

const renderApp = (route: string) => render(
  <MemoryRouter initialEntries={[route]}>
    <App />
  </MemoryRouter>,
);

describe("App without FO diary", () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      removeItem: vi.fn((key: string) => storage.delete(key)),
      clear: vi.fn(() => storage.clear()),
    });
    vi.stubGlobal("indexedDB", undefined);
    vi.clearAllMocks();
    mocks.loadAuthGate.mockResolvedValue({ profile, accessGranted: true });
    mocks.loadAppData.mockResolvedValue(appData());
    mocks.savePatient.mockResolvedValue(patient);
    mocks.saveDotEntry.mockImplementation((entry) => Promise.resolve(entry));
    mocks.saveDiaryEntry.mockImplementation((entry) => Promise.resolve(entry));
    mocks.restoreAppData.mockResolvedValue({ warnings: [] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("redirects the removed diary route back to the dashboard", async () => {
    renderApp("/diary");

    expect(await screen.findByText(/field operation summary/i)).toBeInTheDocument();
    expect(screen.queryByText(/FO Diary/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /diary tracking/i })).not.toBeInTheDocument();
  });

  it("saves patient records without creating diary entries", async () => {
    renderApp("/patients/patient-1");

    fireEvent.click(await screen.findByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(mocks.savePatient).toHaveBeenCalled());
    expect(mocks.saveDiaryEntry).not.toHaveBeenCalled();
  });

  it("saves DOT entries without creating diary entries", async () => {
    renderApp("/patients/patient-1");

    fireEvent.click(await screen.findByLabelText(/treatment day 1, 4FDC, 3 tabs\/day: blank/i));

    await waitFor(() => expect(mocks.saveDotEntry).toHaveBeenCalled());
    expect(mocks.saveDiaryEntry).not.toHaveBeenCalled();
  });

  it("keeps patient data on this device when cloud patient sync fails", async () => {
    mocks.savePatient.mockRejectedValue(new Error("offline"));

    renderApp("/patients/patient-1");

    fireEvent.click(await screen.findByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      const raw = localStorage.getItem("tb-fo-local-data:user-1") || "";
      expect(raw).toContain("QA Patient");
      expect(raw).toContain("patient-1");
    });
    await waitFor(() => {
      const rawQueue = localStorage.getItem("tb-fo-sync-queue:user-1") || "";
      expect(rawQueue).toContain("\"entity\":\"patient\"");
      expect(rawQueue).toContain("offline");
    });
    expect(screen.getByText(/cloud retry needed/i)).toBeInTheDocument();
  });
});
