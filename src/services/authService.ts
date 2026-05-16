import insforge from "../lib/insforgeClient";
import type { Profile } from "../domain/types";
import { profileFromRow, type Row } from "./mappers";

type AuthUser = {
  id: string;
  email?: string;
  [key: string]: unknown;
};

type SignInInput = {
  email: string;
  password: string;
};

type SignUpInput = SignInInput & {
  name?: string;
  redirectTo?: string;
};

type VerifyEmailInput = {
  email: string;
  otp: string;
  name?: string;
};

type ResendVerificationInput = {
  email: string;
  redirectTo?: string;
};

export type AuthGateState = {
  user: AuthUser | null;
  profile: Profile | null;
  accessGranted: boolean;
  reason: "signed-out" | "active" | "pending" | "blocked" | "missing-profile" | "email-verification-required";
};

const nowIso = () => new Date().toISOString();

const toError = (error: unknown, fallback: string): Error => {
  if (error instanceof Error) return error;
  if (error && typeof error === "object" && "message" in error) {
    return new Error(String((error as { message: unknown }).message));
  }
  return new Error(fallback);
};

const throwIfError = (error: unknown, fallback: string): void => {
  if (error) throw toError(error, fallback);
};

const errorMessage = (error: unknown): string =>
  error instanceof Error
    ? error.message
    : error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : "";

const isSignedOutSessionError = (error: unknown): boolean =>
  /no refresh token|refresh token.*provided|not authenticated|session.*missing/i.test(errorMessage(error));

const getResponseUser = (data: unknown): AuthUser | null => {
  const user = (data as { user?: AuthUser | null } | null)?.user;
  return user?.id ? user : null;
};

const requiresEmailCode = (data: unknown): boolean => {
  const response = data as { requireEmailVerification?: boolean; accessToken?: string | null } | null;
  return Boolean(response?.requireEmailVerification && !response.accessToken);
};

const emailVerificationRequiredState = (): AuthGateState => ({
  user: null,
  profile: null,
  accessGranted: false,
  reason: "email-verification-required",
});

export async function signIn(input: SignInInput) {
  const { data, error } = await insforge.auth.signInWithPassword(input);
  throwIfError(error, "Unable to sign in.");
  return data;
}

export async function signUp(input: SignUpInput) {
  const { data, error } = await insforge.auth.signUp(input);
  throwIfError(error, "Unable to sign up.");
  return data;
}

export async function requestAccess(input: SignUpInput): Promise<AuthGateState> {
  const data = await signUp(input);

  if (requiresEmailCode(data)) {
    return emailVerificationRequiredState();
  }

  let user = getResponseUser(data) ?? (await getCurrentUser());
  if (!user) {
    const signInData = await signIn({ email: input.email, password: input.password });
    user = getResponseUser(signInData) ?? (await getCurrentUser());
  }

  if (!user) {
    return {
      user: null,
      profile: null,
      accessGranted: false,
      reason: "signed-out",
    };
  }

  const profile = await ensureProfile(user, input.name);
  return describeAccess(user, profile);
}

export async function verifyEmail(input: VerifyEmailInput) {
  const { data, error } = await insforge.auth.verifyEmail({ email: input.email, otp: input.otp });
  throwIfError(error, "Unable to verify email.");
  return data;
}

export async function verifyEmailAndLoadProfile(input: VerifyEmailInput): Promise<AuthGateState> {
  const data = await verifyEmail(input);
  const user = getResponseUser(data) ?? (await getCurrentUser());

  if (!user) {
    return {
      user: null,
      profile: null,
      accessGranted: false,
      reason: "signed-out",
    };
  }

  const profile = await ensureProfile(user, input.name);
  return describeAccess(user, profile);
}

export async function resendVerificationEmail(input: ResendVerificationInput): Promise<void> {
  const { error } = await insforge.auth.resendVerificationEmail(input);
  throwIfError(error, "Unable to resend verification email.");
}

export async function signOut(): Promise<void> {
  const { error } = await insforge.auth.signOut();
  throwIfError(error, "Unable to sign out.");
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const { data, error } = await insforge.auth.getCurrentUser();
    if (error && !isSignedOutSessionError(error)) console.warn("Current user retrieval failed:", error);
    return (data?.user as AuthUser | null) ?? null;
  } catch (err) {
    console.warn("Failed to load current user (likely offline):", err);
    return null;
  }
}

export async function getActiveProfile(userId?: string): Promise<Profile | null> {
  const id = userId ?? (await getCurrentUser())?.id;
  if (!id) return null;

  try {
    const { data, error } = await insforge.database.from("profiles").select("*").eq("user_id", id).maybeSingle();
    throwIfError(error, "Unable to load active profile.");
    
    if (data) {
      const profile = profileFromRow(data as Row);
      localStorage.setItem(`tb_fo_profile_${id}`, JSON.stringify(profile));
      return profile;
    }
    return null;
  } catch (err) {
    console.warn("Network error fetching profile, attempting to use local cache:", err);
    const cached = localStorage.getItem(`tb_fo_profile_${id}`);
    if (cached) return JSON.parse(cached) as Profile;
    throw err;
  }
}

export async function ensureProfile(user: AuthUser, name?: string): Promise<Profile> {
  const existing = await getActiveProfile(user.id);
  if (existing) {
    if (existing.status === "blocked") return existing;
    if (canAccessApp(existing)) return existing;

    const row = {
      email: existing.email || user.email,
      name: existing.name || name || user.email || "Field Organiser",
      role: "fo",
      status: "active",
      updated_at: nowIso(),
    };

    const { data, error } = await insforge.database
      .from("profiles")
      .update(row)
      .eq("user_id", user.id)
      .select("*")
      .single();
    throwIfError(error, "Unable to activate Field Officer profile.");

    const profile = profileFromRow(data as Row);
    localStorage.setItem(`tb_fo_profile_${user.id}`, JSON.stringify(profile));
    return profile;
  }

  const row = {
    user_id: user.id,
    email: user.email,
    name: name || user.email || "Field Organiser",
    role: "fo",
    status: "active",
    created_at: nowIso(),
    updated_at: nowIso(),
  };

  const { data, error } = await insforge.database.from("profiles").insert([row]).select("*").single();
  throwIfError(error, "Unable to create Field Officer profile.");

  const profile = profileFromRow(data as Row);
  localStorage.setItem(`tb_fo_profile_${user.id}`, JSON.stringify(profile));
  return profile;
}

export async function loadAuthGate(): Promise<AuthGateState> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      user: null,
      profile: null,
      accessGranted: false,
      reason: "signed-out",
    };
  }

  const profile = await ensureProfile(user);
  return describeAccess(user, profile);
}

export async function signInAndLoadProfile(input: SignInInput): Promise<AuthGateState> {
  await signIn(input);
  return loadAuthGate();
}

export function canAccessApp(profile?: Profile | null): boolean {
  return Boolean(profile && profile.status === "active" && profile.role === "fo");
}

export function describeAccess(user: AuthUser, profile: Profile | null): AuthGateState {
  if (!profile) {
    return {
      user,
      profile,
      accessGranted: false,
      reason: "missing-profile",
    };
  }

  if (canAccessApp(profile)) {
    return {
      user,
      profile,
      accessGranted: true,
      reason: "active",
    };
  }

  return {
    user,
    profile,
    accessGranted: false,
    reason: profile.status === "blocked" ? "blocked" : "pending",
  };
}
