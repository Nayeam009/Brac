import { useEffect, useState } from "react";
import { Shield, ArrowRight } from "lucide-react";

export function LoginPage({ authBusy, authMessage, verificationEmail, onRequestAccess, onSignIn, onVerifyEmail, onResendVerification }: {
  authBusy?: boolean; authMessage?: string;
  verificationEmail?: string;
  onRequestAccess: (name: string, email: string, password: string) => void;
  onSignIn: (email: string, password: string) => void;
  onVerifyEmail: (email: string, otp: string) => void;
  onResendVerification: (email: string) => void;
}) {
  const [mode, setMode] = useState<"signin" | "request" | "verify">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [remember, setRemember] = useState(false);
  const isReq = mode === "request";
  const isVerify = mode === "verify";
  const title = isVerify ? "Verify Email" : isReq ? "Create Account" : "Welcome Back";
  const subtitle = isVerify
    ? "Enter the code sent to your email."
    : isReq
      ? "Create your Field Officer account. Approval is not required."
      : "অনুগ্রহ করে লগইন করুন (Please log in)";

  useEffect(() => {
    if (!verificationEmail) return;
    setMode("verify");
    setEmail(verificationEmail);
  }, [verificationEmail]);

  const updateCode = (value: string) => {
    setCode(value.replace(/\D/g, "").slice(0, 6));
  };

  return (
    <main className="auth-page">
      {/* ── Left Hero Panel ── */}
      <section className="auth-hero" aria-hidden="true">
        <div className="auth-hero-brand">
          <div className="auth-hero-logo">TB</div>
          <span className="auth-hero-name">TB-FO Assistant</span>
        </div>
        <div className="auth-hero-visual">
          <img src="/lung-hero.png" alt="" className="auth-hero-img" />
        </div>
        <div className="auth-hero-copy">
          <h2>Empowering frontline<br />tuberculosis care.</h2>
          <p>Secure, offline-capable field operations management for comprehensive patient support.</p>
        </div>
      </section>

      {/* ── Right Form Panel ── */}
      <section className="auth-form-panel">
        <div className="auth-form-inner">
          {/* Header */}
          <div className="auth-form-header">
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>

          {/* Tabs */}
          <div className="auth-tabs" role="tablist">
            <button className={mode === "signin" ? "active" : ""} type="button" role="tab" aria-selected={mode === "signin"} onClick={() => setMode("signin")}>Sign In</button>
            <button className={mode === "request" ? "active" : ""} type="button" role="tab" aria-selected={mode === "request"} onClick={() => setMode("request")}>Sign Up</button>
            <button className={mode === "verify" ? "active" : ""} type="button" role="tab" aria-selected={mode === "verify"} onClick={() => setMode("verify")}>Verify Code</button>
          </div>

          {/* Form */}
          <form className="auth-form" onSubmit={(e) => { e.preventDefault(); isVerify ? onVerifyEmail(email, code) : isReq ? onRequestAccess(name, email, password) : onSignIn(email, password); }}>
            {isReq && (
              <div className="auth-field">
                <label htmlFor="auth-name">পূর্ণ নাম (FULL NAME)</label>
                <input id="auth-name" placeholder="Field Organiser নাম" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
              </div>
            )}
            {!isVerify && (
              <div className="auth-field">
                <label htmlFor="auth-role">Role</label>
                <select id="auth-role" defaultValue="Field Officer" required>
                  <option value="Field Officer">Field Officer</option>
                </select>
              </div>
            )}
            <div className="auth-field">
              <label htmlFor="auth-email">{isVerify ? "Email" : "কার্যক্রমের আইডি / EMAIL / PHONE"}</label>
              <input id="auth-email" placeholder={isVerify ? "Email address" : "Enter your ID"} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            {!isVerify && (
              <div className="auth-field">
                <label htmlFor="auth-pass">পাসওয়ার্ড (PASSWORD)</label>
                <input id="auth-pass" placeholder="••••••••" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete={isReq ? "new-password" : "current-password"} />
              </div>
            )}

            {isVerify && (
              <div className="auth-field">
                <label htmlFor="auth-code">Verification Code</label>
                <input id="auth-code" className="auth-code-input" placeholder="6 digit code" value={code} onChange={(e) => updateCode(e.target.value)} required inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" />
              </div>
            )}

            {!isReq && !isVerify && (
              <label className="auth-remember">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                <span>Remember device</span>
              </label>
            )}

            <button className="auth-submit" disabled={authBusy} type="submit">
              {authBusy ? "যাচাই হচ্ছে..." : isVerify ? "VERIFY CODE" : isReq ? "CREATE ACCOUNT" : "LOGIN SECURELY"}
              {!authBusy && <ArrowRight size={18} />}
            </button>

            {isVerify && (
              <button className="auth-secondary-action" disabled={authBusy || !email} type="button" onClick={() => onResendVerification(email)}>
                Resend code
              </button>
            )}
          </form>

          {authMessage && <p className="auth-message">{authMessage}</p>}

          {/* Security note */}
          <div className="auth-security-note">
            <Shield size={16} />
            <p><strong>Security Note:</strong> Patient data is sensitive. Use only authorized devices.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
