import type { Profile } from "../domain/types";

type SentryModule = typeof import("@sentry/react");

const env = import.meta.env;
let sentryModule: Promise<SentryModule | null> | null = null;
let sentryStarted = false;
let sentryStartupScheduled = false;

type WindowWithIdleCallback = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
};

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

const scheduleAfterFirstPaint = (callback: () => void) => {
  if (typeof window === "undefined") {
    callback();
    return;
  }

  const runWhenIdle = () => {
    const browserWindow = window as WindowWithIdleCallback;
    if (typeof browserWindow.requestIdleCallback === "function") {
      browserWindow.requestIdleCallback(callback, { timeout: 3000 });
      return;
    }

    window.setTimeout(callback, 0);
  };

  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(() => window.setTimeout(runWhenIdle, 0));
    return;
  }

  window.setTimeout(runWhenIdle, 0);
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

export function initSentryAfterFirstPaint() {
  if (!isSentryEnabled || sentryStarted || sentryStartupScheduled) return;
  sentryStartupScheduled = true;

  scheduleAfterFirstPaint(() => {
    sentryStartupScheduled = false;
    initSentry();
  });
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
