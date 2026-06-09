import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Patient } from "../domain/types";
import { PatientRegistryPage } from "./PatientRegistryPage";

const patient = (overrides: Partial<Patient>): Patient => ({
  id: "pat_base",
  name: "Base Patient",
  phase: "Intensive Phase",
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z",
  ...overrides,
});

describe("PatientRegistryPage filters", () => {
  it("filters patients by separate registration month and year controls", () => {
    render(
      <PatientRegistryPage
        patients={[
          patient({ id: "may", name: "May Patient", registrationDate: "2026-05-12", tr: "M-1" }),
          patient({ id: "last-year-may", name: "Last Year May Patient", registrationDate: "2025-05-12", tr: "M-2" }),
          patient({ id: "june", name: "June Patient", registrationDate: "2026-06-01", tr: "J-1" }),
          patient({ id: "missing", name: "Missing Date Patient", tr: "N-1" }),
        ]}
        tasks={[]}
        onOpen={vi.fn()}
      />,
    );

    expect(screen.getByText("May Patient")).toBeInTheDocument();
    expect(screen.getByText("Last Year May Patient")).toBeInTheDocument();
    expect(screen.getByText("June Patient")).toBeInTheDocument();
    expect(screen.getByText("Missing Date Patient")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Registration month filter"), { target: { value: "05" } });

    expect(screen.getByText("May Patient")).toBeInTheDocument();
    expect(screen.getByText("Last Year May Patient")).toBeInTheDocument();
    expect(screen.queryByText("June Patient")).not.toBeInTheDocument();
    expect(screen.queryByText("Missing Date Patient")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Registration year filter"), { target: { value: "2026" } });

    expect(screen.getByText("May Patient")).toBeInTheDocument();
    expect(screen.queryByText("Last Year May Patient")).not.toBeInTheDocument();
    expect(screen.queryByText("June Patient")).not.toBeInTheDocument();
    expect(screen.queryByText("Missing Date Patient")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "All registration dates" }));

    expect(screen.getByText("May Patient")).toBeInTheDocument();
    expect(screen.getByText("Last Year May Patient")).toBeInTheDocument();
    expect(screen.getByText("June Patient")).toBeInTheDocument();
    expect(screen.getByText("Missing Date Patient")).toBeInTheDocument();
  });

  it("combines search, phase, TB type and registration month filters", () => {
    render(
      <PatientRegistryPage
        patients={[
          patient({ id: "match", name: "Sujon Match", tr: "173/26", phase: "Intensive Phase", tbType: "Pulmonary", registrationDate: "2026-05-15" }),
          patient({ id: "wrong-month", name: "Sujon Old", tr: "174/26", phase: "Intensive Phase", tbType: "Pulmonary", registrationDate: "2026-04-15" }),
          patient({ id: "wrong-type", name: "Sujon EP", tr: "175/26", phase: "Intensive Phase", tbType: "Extra-pulmonary", registrationDate: "2026-05-16" }),
          patient({ id: "wrong-phase", name: "Sujon Done", tr: "176/26", phase: "Completed", tbType: "Pulmonary", registrationDate: "2026-05-17" }),
        ]}
        tasks={[]}
        onOpen={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Sujon" } });
    fireEvent.change(screen.getByLabelText("Phase filter"), { target: { value: "Intensive Phase" } });
    fireEvent.change(screen.getByLabelText("TB Type filter"), { target: { value: "Pulmonary" } });
    fireEvent.change(screen.getByLabelText("Registration month filter"), { target: { value: "05" } });
    fireEvent.change(screen.getByLabelText("Registration year filter"), { target: { value: "2026" } });

    expect(screen.getByText("Sujon Match")).toBeInTheDocument();
    expect(screen.queryByText("Sujon Old")).not.toBeInTheDocument();
    expect(screen.queryByText("Sujon EP")).not.toBeInTheDocument();
    expect(screen.queryByText("Sujon Done")).not.toBeInTheDocument();
  });
});
