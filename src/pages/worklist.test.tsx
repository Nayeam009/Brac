import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { Patient, Task } from "../domain/types";
import { WorklistPage } from "./WorklistPage";

const patient: Patient = {
  id: "pat-1",
  name: "Amina",
  createdAt: "2026-05-15T00:00:00.000Z",
  updatedAt: "2026-05-15T00:00:00.000Z",
};

const tasks: Task[] = [
  {
    id: "dot-1",
    patientId: "pat-1",
    type: "DOT_MISSED",
    title: "DOT missed follow-up",
    priority: "High",
    status: "Open",
    createdAt: "2026-05-15T00:00:00.000Z",
  },
  {
    id: "lab-1",
    patientId: "pat-1",
    type: "DR_TB_REFERRAL",
    title: "RR result urgent review",
    priority: "Critical",
    status: "Open",
    createdAt: "2026-05-15T00:00:00.000Z",
  },
];

describe("WorklistPage query filters", () => {
  it("uses the filter query parameter for deep-linked quick actions", () => {
    render(
      <MemoryRouter initialEntries={["/today?filter=DOT"]}>
        <Routes>
          <Route path="/today" element={<WorklistPage patients={[patient]} tasks={tasks} onOpen={vi.fn()} />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("DOT missed follow-up")).toBeInTheDocument();
    expect(screen.queryByText("RR result urgent review")).not.toBeInTheDocument();
  });
});
