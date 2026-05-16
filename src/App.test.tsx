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
  saveContact: vi.fn(),
  saveTptRecord: vi.fn(),
  saveSputumFollowUp: vi.fn(),
  saveProvider: vi.fn(),
  restoreAppData: vi.fn(),
  deletePatientWithCleanup: vi.fn(),
  uploadRecordAttachment: vi.fn(),
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
  saveContact: mocks.saveContact,
  saveTptRecord: mocks.saveTptRecord,
  saveSputumFollowUp: mocks.saveSputumFollowUp,
  saveProvider: mocks.saveProvider,
  restoreAppData: mocks.restoreAppData,
  deletePatientWithCleanup: mocks.deletePatientWithCleanup,
  uploadRecordAttachment: mocks.uploadRecordAttachment,
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

describe("App diary tracking toggle", () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      removeItem: vi.fn((key: string) => storage.delete(key)),
      clear: vi.fn(() => storage.clear()),
    });
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

  it("defaults diary tracking on and persists when FO turns it off", async () => {
    renderApp("/diary");

    const checkbox = await screen.findByRole("checkbox", { name: /diary tracking/i });

    expect(checkbox).toBeChecked();
    expect(screen.getByText("On - updates are tracked")).toBeInTheDocument();

    fireEvent.click(checkbox);

    expect(checkbox).not.toBeChecked();
    expect(localStorage.getItem("tb-fo-diary-tracking-enabled")).toBe("false");
    expect(screen.getByText("Off - data saves without diary logging")).toBeInTheDocument();
    expect(screen.getByText("Previous data entry mode: patient updates will save, but diary tracking is paused.")).toBeInTheDocument();
    expect(screen.getByText("Diary off")).toBeInTheDocument();
  });

  it("saves patient records without creating diary entries when tracking is off", async () => {
    localStorage.setItem("tb-fo-diary-tracking-enabled", "false");

    renderApp("/patients/patient-1");

    fireEvent.click(await screen.findByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(mocks.savePatient).toHaveBeenCalled());
    expect(mocks.saveDiaryEntry).not.toHaveBeenCalled();
    expect(screen.getByText("Diary off")).toBeInTheDocument();
  });

  it("saves DOT entries without creating diary entries when tracking is off", async () => {
    localStorage.setItem("tb-fo-diary-tracking-enabled", "false");

    renderApp("/patients/patient-1");

    fireEvent.click(await screen.findByLabelText(/treatment day 1, 4FDC, 3 tabs\/day: blank/i));

    await waitFor(() => expect(mocks.saveDotEntry).toHaveBeenCalled());
    expect(mocks.saveDiaryEntry).not.toHaveBeenCalled();
  });

  it("resumes diary creation when tracking is on", async () => {
    localStorage.setItem("tb-fo-diary-tracking-enabled", "true");

    renderApp("/patients/patient-1");

    fireEvent.click(await screen.findByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(mocks.savePatient).toHaveBeenCalled());
    await waitFor(() => expect(mocks.saveDiaryEntry).toHaveBeenCalled());
  });
});
