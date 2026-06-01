import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Patient, SputumFollowUp } from "../domain/types";
import { deriveMonthlyFollowUpRows, MonthlyFollowUpPage, monthlyFollowUpRowsToCsvRows } from "./MonthlyFollowUpPage";

const basePatient = (overrides: Partial<Patient>): Patient => ({
  id: "pat_base",
  name: "Base Patient",
  phase: "Intensive Phase",
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z",
  ...overrides,
});

describe("MonthlyFollowUpPage derivation", () => {
  it("includes pulmonary BC 2M, 5M and 6M dates from drug start using 30-day months", () => {
    const rows = deriveMonthlyFollowUpRows([
      basePatient({
        id: "pat_bc",
        name: "Sujon",
        tr: "173/26",
        tbType: "Pulmonary",
        confirmationMethod: "BC",
        drugStartDate: "2026-05-01",
      }),
    ], [], "2026-06");

    expect(rows[0].stages["2M"].dueDate).toBe("2026-06-29");
    expect(rows[0].stages["5M"].dueDate).toBe("2026-09-27");
    expect(rows[0].stages["6M"].dueDate).toBe("2026-10-27");
    expect(rows[0].dueThisMonth).toBe(true);
  });

  it("includes only 2M sputum for pulmonary CD patients", () => {
    const rows = deriveMonthlyFollowUpRows([
      basePatient({
        id: "pat_cd",
        name: "Rahim",
        tbType: "Pulmonary",
        confirmationMethod: "CD",
        drugStartDate: "2026-05-01",
      }),
    ], [], "2026-09");

    expect(rows[0].stages["2M"].dueDate).toBe("2026-06-29");
    expect(rows[0].stages["5M"].dueLabel).toBe("Not required (CD)");
    expect(rows[0].stages["6M"].dueLabel).toBe("Not required (CD)");
  });

  it("marks extra-pulmonary patients as sputum not required", () => {
    const rows = deriveMonthlyFollowUpRows([
      basePatient({
        id: "pat_ep",
        name: "Karim",
        tbType: "Extra-pulmonary",
        confirmationMethod: "CD",
        drugStartDate: "2026-05-01",
      }),
    ], [], "2026-06");

    expect(rows[0].stages["2M"].dueLabel).toBe("Not required (EP)");
    expect(rows[0].stages["5M"].dueLabel).toBe("Not required (EP)");
    expect(rows[0].stages["6M"].dueLabel).toBe("Not required (EP)");
  });

  it("shows saved sputum data in row fields and CSV with dd/mm/yyyy dates", () => {
    const followUps: SputumFollowUp[] = [{
      id: "sp_2m",
      patientId: "pat_bc",
      stage: "2M",
      testDate: "2026-06-30",
      labId: "LAB-22",
      microscopyResult: "Negative",
      geneXpertResult: "MTB Not Detected",
      weightKg: 44,
      comment: "Good progress",
      createdAt: "2026-06-30T00:00:00.000Z",
      updatedAt: "2026-06-30T00:00:00.000Z",
    }];
    const rows = deriveMonthlyFollowUpRows([
      basePatient({
        id: "pat_bc",
        name: "Sujon",
        tbType: "Pulmonary",
        confirmationMethod: "BC",
        treatmentStartDate: "2026-05-01",
        drugStartDate: "2026-05-01",
      }),
    ], followUps, "2026-06");

    expect(rows[0].stages["2M"]).toEqual(expect.objectContaining({
      testLabel: "30/06/2026",
      labId: "LAB-22",
      result: "Negative / MTB Not Detected",
      weight: "44 kg",
      comment: "Good progress",
    }));
    expect(monthlyFollowUpRowsToCsvRows(rows)[0]).toEqual(expect.objectContaining({
      "Treatment start date": "01/05/2026",
      "2M probable date": "29/06/2026",
      "Actual sputum test date": expect.stringContaining("2M: 30/06/2026"),
      "Lab No": expect.stringContaining("2M: LAB-22"),
    }));
  });
});

describe("MonthlyFollowUpPage UI", () => {
  const patients: Patient[] = [
    basePatient({
      id: "pat_one",
      name: "Amina",
      tr: "101/26",
      phone: "01711111111",
      union: "Ichhapura",
      dotProviderName: "Rina SS",
      tbType: "Pulmonary",
      confirmationMethod: "BC",
      drugStartDate: "2026-05-01",
    }),
    basePatient({
      id: "pat_two",
      name: "Babul",
      tr: "102/26",
      phone: "01822222222",
      union: "Rasunia",
      tbType: "Pulmonary",
      confirmationMethod: "CD",
    }),
    basePatient({
      id: "pat_closed",
      name: "Closed Patient",
      phase: "Completed",
      tbType: "Pulmonary",
      confirmationMethod: "BC",
      drugStartDate: "2026-05-01",
    }),
  ];

  it("renders active patients, controls, print and CSV actions", () => {
    render(<MonthlyFollowUpPage patients={patients} sputumFollowUps={[]} />);

    expect(screen.getByRole("heading", { name: "Monthly Follow-up" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /print/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /csv export/i })).toBeInTheDocument();
    expect(screen.getAllByText("Amina")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Babul")[0]).toBeInTheDocument();
    expect(screen.queryByText("Closed Patient")).not.toBeInTheDocument();
    expect(screen.getAllByText(/Drug start needed/i).length).toBeGreaterThan(0);
  });

  it("filters rows by location and search text", () => {
    render(<MonthlyFollowUpPage patients={patients} sputumFollowUps={[]} />);

    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "Ichhapura" } });

    expect(screen.getAllByText("Amina")[0]).toBeInTheDocument();
    expect(screen.queryByText("Babul")).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Name, TR, phone, DOT/SS"), { target: { value: "102/26" } });

    expect(screen.queryByText("Amina")).not.toBeInTheDocument();
    expect(screen.getByText(/No active patients match this sheet filter/i)).toBeInTheDocument();
  });

  it("searches by DOT or SS name", () => {
    render(<MonthlyFollowUpPage patients={patients} sputumFollowUps={[]} />);

    fireEvent.change(screen.getByPlaceholderText("Name, TR, phone, DOT/SS"), { target: { value: "Rina" } });

    expect(screen.getAllByText("Amina")[0]).toBeInTheDocument();
    expect(screen.queryByText("Babul")).not.toBeInTheDocument();
  });
});
