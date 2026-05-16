import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";
import { captureAppError } from "../lib/sentry";

type Props = {
  children: ReactNode;
};

type State = {
  error?: Error;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("TB-FO Assistant render failure", error, info.componentStack);
    captureAppError(error, { componentStack: info.componentStack });
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="auth-page" style={{ gridTemplateColumns: "1fr" }}>
        <section className="auth-form-panel">
          <div className="auth-form-inner" style={{ textAlign: "center" }}>
            <div className="auth-hero-brand" style={{ justifyContent: "center" }}>
              <div className="auth-hero-logo" style={{ background: "var(--gl)", color: "var(--g)" }}>TB</div>
              <span style={{ color: "var(--ink)", fontWeight: 700 }}>TB-FO Assistant</span>
            </div>
            <h1 style={{ margin: "16px 0 8px" }}>অ্যাপ খুলতে সমস্যা হয়েছে</h1>
            <p style={{ color: "var(--muted)" }}>একটি অপ্রত্যাশিত সমস্যা হয়েছে। পেজ refresh করলে বেশিরভাগ ক্ষেত্রে কাজ চালু হবে।</p>
            <button className="auth-submit" type="button" onClick={() => window.location.reload()} style={{ marginTop: "12px" }}>
              Refresh App
            </button>
            <small style={{ display: "block", marginTop: "12px", color: "var(--red)" }}>{this.state.error.message}</small>
          </div>
        </section>
      </main>
    );
  }
}
