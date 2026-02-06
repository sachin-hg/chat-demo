"use client";

import { useState } from "react";

interface Props {
  onLoggedIn: () => void;
}

export function LoginScreen({ onLoggedIn }: Props) {
  const [phone, setPhone] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [otp, setOtp] = useState("");

  const handleSendOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.trim().length >= 10) setStep("otp");
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.trim().length >= 4) onLoggedIn();
  };

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 max-w-sm">
      <p className="text-sm text-[var(--text-muted)] mb-3">Login to continue</p>
      {step === "phone" ? (
        <form onSubmit={handleSendOtp} className="space-y-2">
          <input
            type="tel"
            placeholder="Phone number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm"
          />
          <button
            type="submit"
            className="w-full py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium"
          >
            Send OTP
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerifyOtp} className="space-y-2">
          <input
            type="text"
            placeholder="Enter OTP"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm"
          />
          <button
            type="submit"
            className="w-full py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium"
          >
            Verify & Login
          </button>
        </form>
      )}
    </div>
  );
}
