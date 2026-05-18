import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppShell, DateInput, DotGrid, PatientCard, StatusBadge, WorklistItem } from "./index";
import type { Patient, Task } from "../domain/types";
import { calculateDrugDosePlan } from "../domain/automation";

const patient: Patient = {
  id: "p1",
  name: "রহিমা বেগম",
  tr: "TR-102",
  phase: "Intensive Phase",
  nextFollowUpDate: "2026-05-14",
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z",
};

const task: Task = {
  id: "w1",
  type: "DOT_MISSED",
  title: "DOT আপডেট বাকি",
  patientId: "p1",
  priority: "High",
  status: "Open",
  dueDate: "2026-05-13",
  createdAt: "2026-05-13T00:00:00.000Z",
};

describe("TB-FO UI components", () => {
  it("renders the Bangla-first app shell navigation and content", () => {
    render(
      <MemoryRouter>
        <AppShell onNewPatient={vi.fn()}>
          <h1>ড্যাশবোর্ড</h1>
        </AppShell>
      </MemoryRouter>,
    );

    expect(screen.getAllByText("TB-FO Assistant")[0]).toBeInTheDocument();
    expect(screen.getAllByText("ড্যাশবোর্ড")[0]).toBeInTheDocument();
    expect(screen.getAllByText("রোগী")[0]).toBeInTheDocument();
  });

  it("collapses and expands the desktop sidebar", () => {
    render(
      <MemoryRouter>
        <AppShell onNewPatient={vi.fn()}>
          <h1>à¦¡à§à¦¯à¦¾à¦¶à¦¬à§‹à¦°à§à¦¡</h1>
        </AppShell>
      </MemoryRouter>,
    );

    const sidebar = screen.getByLabelText("Desktop sidebar");
    const toggle = screen.getByRole("button", { name: "Collapse sidebar" });

    expect(sidebar).not.toHaveClass("collapsed");
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(toggle);

    expect(sidebar).toHaveClass("collapsed");
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toHaveAttribute("aria-expanded", "false");
  });

  it("renders patient, worklist and DOT status surfaces", () => {
    render(
      <MemoryRouter>
        <PatientCard patient={patient} tasks={[task]} onOpen={vi.fn()} />
        <WorklistItem task={task} patient={patient} />
        <DotGrid patientId="p1" entries={[{ id: "dot1", patientId: "p1", date: "2026-05-01", monthKey: "2026-05", day: 1, status: "done", updatedAt: "2026-05-01T00:00:00.000Z" }]} monthKey="2026-05" onMonthChange={vi.fn()} onToggle={vi.fn()} />
        <StatusBadge tone="success">সম্পন্ন</StatusBadge>
      </MemoryRouter>,
    );

    expect(screen.getAllByText("রহিমা বেগম")[0]).toBeInTheDocument();
    expect(screen.getByText("Follow-up 14/05/2026")).toBeInTheDocument();
    expect(screen.getByText(/Due 13\/05\/2026/)).toBeInTheDocument();
    expect(screen.getByText("05/2026")).toBeInTheDocument();
    expect(screen.getByText("DOT আপডেট বাকি")).toBeInTheDocument();
    expect(screen.getByLabelText("দিন 1: done")).toBeInTheDocument();
    expect(screen.getByText("সম্পন্ন")).toBeInTheDocument();
  });

  it("shows the DOT grid as a medicine plan from drug start through treatment end", () => {
    render(
      <DotGrid
        patientId="p1"
        entries={[{ id: "dot1", patientId: "p1", date: "2026-05-10", monthKey: "2026-05", day: 10, status: "done", updatedAt: "2026-05-10T00:00:00.000Z" }]}
        monthKey="2026-05"
        treatmentStartDate="2026-05-10"
        treatmentEndDate="2026-11-05"
        startSource="drug-start"
        dosePlan={calculateDrugDosePlan("CAT-1 / 4FDC", 40, "Intensive Phase")}
        onMonthChange={vi.fn()}
        onToggle={vi.fn()}
      />,
    );

    expect(screen.getAllByText(/Drug start 10\/05\/2026/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Day 1-60 4FDC 3 tabs\/day/)).toBeInTheDocument();
    expect(screen.getByText(/Day 61-180 2FDC 3 tabs\/day/)).toBeInTheDocument();
    expect(screen.getByLabelText(/treatment day 1, 4FDC, 3 tabs\/day: done/)).toBeInTheDocument();
  });

  it("accepts dd/mm/yyyy date input and flags invalid dates", () => {
    const onChange = vi.fn();

    render(<DateInput aria-label="Follow-up date" value="" onChange={onChange} />);

    const input = screen.getByLabelText("Follow-up date");
    fireEvent.change(input, { target: { value: "05092026" } });

    expect(input).toHaveValue("05/09/2026");
    expect(onChange).toHaveBeenLastCalledWith("2026-09-05");

    fireEvent.change(input, { target: { value: "141026" } });

    expect(onChange).toHaveBeenLastCalledWith("2026-10-14");

    fireEvent.change(input, { target: { value: "31/02/2026" } });
    fireEvent.blur(input);

    expect(input).toHaveAttribute("aria-invalid", "true");
  });
});
