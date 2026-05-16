import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LoginPage } from "./index";

describe("LoginPage", () => {
  it("renders InsForge sign-in controls", () => {
    render(<LoginPage authMessage="InsForge Auth ready" onRequestAccess={vi.fn()} onSignIn={vi.fn()} onVerifyEmail={vi.fn()} onResendVerification={vi.fn()} />);

    expect(screen.getByRole("button", { name: "LOGIN SECURELY" })).toBeInTheDocument();
    expect(screen.getByText("InsForge Auth ready")).toBeInTheDocument();
  });

  it("only presents the Field Officer role", () => {
    render(<LoginPage authMessage="InsForge Auth ready" onRequestAccess={vi.fn()} onSignIn={vi.fn()} onVerifyEmail={vi.fn()} onResendVerification={vi.fn()} />);

    expect(screen.getByLabelText("Role")).toHaveValue("Field Officer");
    expect(screen.queryByText("Supervisor")).not.toBeInTheDocument();
    expect(screen.queryByText("Lab Tech")).not.toBeInTheDocument();
    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
  });

  it("shows a verification code form and submits the emailed code", () => {
    const onVerifyEmail = vi.fn();
    render(
      <LoginPage
        authMessage="Verification code sent."
        verificationEmail="kh@example.com"
        onRequestAccess={vi.fn()}
        onSignIn={vi.fn()}
        onVerifyEmail={onVerifyEmail}
        onResendVerification={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Verify Email" })).toBeInTheDocument();
    expect(screen.getByLabelText("Verification Code")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Verification Code"), { target: { value: "998113" } });
    fireEvent.submit(screen.getByRole("button", { name: "VERIFY CODE" }).closest("form")!);

    expect(onVerifyEmail).toHaveBeenCalledWith("kh@example.com", "998113");
  });
});
