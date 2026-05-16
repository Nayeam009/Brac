import { describe, expect, it } from "vitest";
import { canAccessApp } from "./authService";
import type { Profile } from "../domain/types";

const activeProfile = (role: Profile["role"]): Profile => ({
  id: `${role}-profile`,
  userId: "user-1",
  email: `${role}@example.com`,
  role,
  status: "active",
  createdAt: "2026-05-13T00:00:00.000Z",
  updatedAt: "2026-05-13T00:00:00.000Z",
});

describe("canAccessApp", () => {
  it("allows only active Field Officer profiles", () => {
    expect(canAccessApp(activeProfile("fo"))).toBe(true);
    expect(canAccessApp({ ...activeProfile("fo"), role: "admin" as Profile["role"] })).toBe(false);
  });

  it("blocks pending, blocked, and missing profiles", () => {
    expect(canAccessApp(undefined)).toBe(false);
    expect(canAccessApp({ ...activeProfile("fo"), status: "pending" })).toBe(false);
    expect(canAccessApp({ ...activeProfile("fo"), status: "blocked" })).toBe(false);
  });
});
