import { createClient } from "@insforge/sdk";

const env =
  ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {});

export const insforgeBaseUrl =
  env.VITE_INSFORGE_BASE_URL || env.VITE_INSFORGE_URL || "";

export const insforgeAnonKey = env.VITE_INSFORGE_ANON_KEY || "";

export const insforgeConfigError =
  !insforgeBaseUrl || !insforgeAnonKey
    ? "Missing VITE_INSFORGE_URL/VITE_INSFORGE_BASE_URL or VITE_INSFORGE_ANON_KEY."
    : "";

export const insforge = createClient({
  baseUrl: insforgeBaseUrl,
  anonKey: insforgeAnonKey || undefined,
});

export default insforge;
