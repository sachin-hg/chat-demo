"use client";

import { useState } from "react";

type LoginReason = "shortlist" | "contact" | null;

interface LoginBottomSheetProps {
  open: boolean;
  reason: LoginReason;
  onClose: () => void;
  onLoggedIn: () => Promise<void> | void;
}

export function LoginBottomSheet({ open, reason, onClose, onLoggedIn }: LoginBottomSheetProps) {
  const [step, setStep] = useState<"phone" | "otp" | "success">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", ""]);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const title =
    reason === "contact"
      ? "Login to contact seller"
      : reason === "shortlist"
      ? "Login to shortlist properties"
      : "Login to continue";

  const handlePhoneSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.trim().length >= 10) {
      setStep("otp");
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^[0-9]?$/.test(value)) return;
    const next = [...otp];
    next[index] = value;
    setOtp(next);
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = otp.join("");
    if (code.length < 4 || submitting) return;
    setSubmitting(true);
    try {
      await onLoggedIn();
      setStep("success");
      setTimeout(() => {
        onClose();
        setStep("phone");
        setOtp(["", "", "", ""]);
        setSubmitting(false);
      }, 800);
    } catch {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-[430px] mx-auto bg-white rounded-t-3xl pt-3 pb-6 px-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-[#e1e2e8] rounded-full mx-auto mb-4" />
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/0 text-[#767676] hover:bg-[#f5f5f5] transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#767676" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Phone step */}
        {step === "phone" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-[17px] font-semibold text-[#222] mb-1">{title}</h2>
              <p className="text-xs text-[#767676]">
                We use your number to connect you with the seller and save your shortlisted properties.
              </p>
            </div>
            <form onSubmit={handlePhoneSubmit} className="space-y-4">
              <div className="flex items-center gap-2 rounded-xl border border-[#e1e2e8] bg-[#fafafa] px-3 py-2.5">
                <div className="flex items-center pr-2 border-r border-[#e1e2e8]">
                  <span className="text-sm font-medium text-[#222]">+91</span>
                </div>
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, ""))}
                  className="flex-1 bg-transparent text-sm text-[#222] placeholder-[#767676] focus:outline-none"
                  placeholder="Phone number"
                />
              </div>
              <button
                type="submit"
                disabled={phone.trim().length < 10}
                className="w-full h-11 rounded-xl bg-[#5E23DC] text-white text-sm font-medium disabled:opacity-40 flex items-center justify-center"
              >
                Continue
              </button>
            </form>
            <div className="flex items-center gap-3 text-[11px] text-[#767676]">
              <div className="flex-1 h-px bg-[#e1e2e8]" />
              <span>OR</span>
              <div className="flex-1 h-px bg-[#e1e2e8]" />
            </div>
            <button
              type="button"
              disabled
              className="w-full h-11 rounded-xl border border-[#e1e2e8] bg-white text-sm font-medium text-[#5E23DC] flex items-center justify-center gap-2 opacity-60 cursor-default"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#5E23DC">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884" />
              </svg>
              Continue with WhatsApp
            </button>
          </div>
        )}

        {/* OTP step */}
        {step === "otp" && (
          <form onSubmit={handleOtpSubmit} className="space-y-5">
            <div>
              <h2 className="text-[17px] font-semibold text-[#222] mb-1">Verify your number</h2>
              <p className="text-xs text-[#767676]">Enter the 4-digit code sent to your phone number</p>
            </div>
            <div className="flex items-center justify-between gap-3">
              {otp.map((val, idx) => (
                <input
                  key={idx}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={val}
                  onChange={(e) => handleOtpChange(idx, e.target.value)}
                  className="w-11 h-11 rounded-lg border border-[#e1e2e8] text-center text-base font-medium text-[#222] focus:outline-none focus:border-[#5E23DC]"
                />
              ))}
            </div>
            <button
              type="submit"
              disabled={otp.join("").length < 4 || submitting}
              className="w-full h-11 rounded-xl bg-[#5E23DC] text-white text-sm font-medium disabled:opacity-40 flex items-center justify-center"
            >
              Continue
            </button>
            <p className="text-xs text-[#767676] text-center">
              Didn&apos;t receive code? <button type="button" className="text-[#5E23DC] font-medium">Resend</button>
            </p>
          </form>
        )}

        {/* Success step */}
        {step === "success" && (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="w-10 h-10 rounded-full bg-[#0F8458]/10 flex items-center justify-center text-[#0F8458]">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p className="text-sm font-medium text-[#222]">You&apos;re logged in!</p>
          </div>
        )}
      </div>
    </div>
  );
}

