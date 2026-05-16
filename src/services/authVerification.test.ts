import { beforeEach, describe, expect, it, vi } from "vitest";

const signUp = vi.fn();
const verifyEmail = vi.fn();
const signInWithPassword = vi.fn();
const getCurrentUser = vi.fn();
const signOut = vi.fn();
const from = vi.fn();

vi.mock("../lib/insforgeClient", () => ({
  default: {
    auth: {
      signUp,
      verifyEmail,
      signInWithPassword,
      getCurrentUser,
      signOut,
    },
    database: {
      from,
    },
  },
}));

describe("auth email verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      removeItem: vi.fn((key: string) => storage.delete(key)),
      clear: vi.fn(() => storage.clear()),
    });
  });

  it("returns a verification-required state when signup needs an email code", async () => {
    const { requestAccess } = await import("./authService");
    signUp.mockResolvedValue({
      data: {
        requireEmailVerification: true,
        accessToken: null,
        user: { id: "user-1", email: "kh@example.com" },
      },
      error: null,
    });

    const state = await requestAccess({
      name: "KH Nayeam",
      email: "kh@example.com",
      password: "secret123",
      redirectTo: "http://localhost:5173/login",
    });

    expect(state.reason).toBe("email-verification-required");
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("verifies the emailed code and creates an active Field Officer profile", async () => {
    const { verifyEmailAndLoadProfile } = await import("./authService");
    const user = { id: "user-1", email: "kh@example.com" };
    const insertedRows: unknown[][] = [];
    verifyEmail.mockResolvedValue({ data: { user, accessToken: "token" }, error: null });
    from.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    });
    from.mockReturnValueOnce({
      insert: (rows: unknown[]) => {
        insertedRows.push(rows);
        return ({
        select: () => ({
          single: () => Promise.resolve({ data: { id: "profile-1", ...(rows[0] as object) }, error: null }),
        }),
        });
      },
    });

    const state = await verifyEmailAndLoadProfile({
      email: "kh@example.com",
      otp: "998113",
      name: "KH Nayeam",
    });

    expect(verifyEmail).toHaveBeenCalledWith({ email: "kh@example.com", otp: "998113" });
    expect(insertedRows[0][0]).toMatchObject({ role: "fo", status: "active" });
    expect(state.reason).toBe("active");
    expect(state.accessGranted).toBe(true);
    expect(state.profile?.email).toBe("kh@example.com");
  });

  it("normalizes an existing non-FO profile to active Field Officer access", async () => {
    const { verifyEmailAndLoadProfile } = await import("./authService");
    const user = { id: "user-1", email: "kh@example.com" };
    const existingProfile = {
      id: "profile-1",
      user_id: "user-1",
      email: "kh@example.com",
      name: "KH Nayeam",
      role: "admin",
      status: "pending",
      created_at: "2026-05-15T00:00:00.000Z",
      updated_at: "2026-05-15T00:00:00.000Z",
    };
    const updates: unknown[] = [];
    verifyEmail.mockResolvedValue({ data: { user, accessToken: "token" }, error: null });
    from.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: existingProfile, error: null }),
        }),
      }),
    });
    from.mockReturnValueOnce({
      update: (row: unknown) => {
        updates.push(row);
        return {
          eq: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: { ...existingProfile, ...(row as object), updated_at: "2026-05-15T01:00:00.000Z" },
                  error: null,
                }),
            }),
          }),
        };
      },
    });

    const state = await verifyEmailAndLoadProfile({
      email: "kh@example.com",
      otp: "998113",
      name: "KH Nayeam",
    });

    expect(updates[0]).toMatchObject({ role: "fo", status: "active" });
    expect(state.profile?.role).toBe("fo");
    expect(state.profile?.status).toBe("active");
    expect(state.accessGranted).toBe(true);
  });

  it("treats a missing refresh token as a normal signed-out state", async () => {
    const { getCurrentUser: loadCurrentUser } = await import("./authService");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    getCurrentUser.mockResolvedValue({
      data: { user: null },
      error: new Error("No refresh token provided"),
    });

    await expect(loadCurrentUser()).resolves.toBeNull();
    expect(warn).not.toHaveBeenCalled();

    warn.mockRestore();
  });
});
