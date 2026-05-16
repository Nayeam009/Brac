import { createClient } from "@insforge/sdk";

const baseUrl = process.env.INSFORGE_BASE_URL || process.env.VITE_INSFORGE_BASE_URL;
const anonKey = process.env.INSFORGE_ANON_KEY || process.env.VITE_INSFORGE_ANON_KEY;

if (!baseUrl || !anonKey) {
  throw new Error("Missing INSFORGE_BASE_URL/INSFORGE_ANON_KEY or VITE_INSFORGE_* env values.");
}

const response = await fetch(new URL("/api/health", baseUrl));
if (!response.ok) {
  throw new Error(`InsForge health check failed: ${response.status} ${response.statusText}`);
}

const client = createClient({ baseUrl, anonKey, isServerMode: true });
const health = await response.json().catch(() => ({}));

console.log(`Connected to InsForge backend: ${baseUrl}`);
if (health.version) console.log(`Backend version: ${health.version}`);
console.log(`SDK ready: ${typeof client.database.from === "function"}`);
