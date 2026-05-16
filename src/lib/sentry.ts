import type { Profile } from "../domain/types";

type SentryModule = typeof import("@sentry/react");

const env = import.meta.env;
let sentryModule: Promise<SentryModule | null> | null = null;
let sentryStarted = false;

const parseSampleRate = (value?: string) => {
  if (!value) return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(Math.max(parsed, 0), 1);
};

export const isSentryEnabled = Boolean(env.VITE_SENTRY_DSN);

const loadSentry = () => {
  if (!isSentryEnabled) return Promise.resolve(null);
  sentryModule ||= import("@sentry/react");
  return sentryModule;
};

export function initSentry() {
  if (!isSentryEnabled || sentryStarted) return;
  sentryStarted = true;

  void loadSentry().then((Sentry) => Sentry?.init({
    dsn: env.VITE_SENTRY_DSN,
    environment: env.VITE_SENTRY_ENVIRONMENT || env.MODE,
    release: env.VITE_SENTRY_RELEASE,
    tracesSampleRate: parseSampleRate(env.VITE_SENTRY_TRACES_SAMPLE_RATE),
    sendDefaultPii: false,
  }));
}

export function captureAppError(error: unknown, context?: Record<string, unknown>) {
  if (!isSentryEnabled) return;

  void loadSentry().then((Sentry) => Sentry?.captureException(error, {
    extra: context,
  }));
}

export function setSentryProfile(profile: Profile | null) {
  if (!isSentryEnabled) return;

  void loadSentry().then((Sentry) => Sentry?.setUser(profile ? { id: profile.userId, role: profile.role } : null));
}
