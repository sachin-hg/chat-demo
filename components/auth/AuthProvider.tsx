"use client";

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { LoginBottomSheet } from "@/components/chat/LoginBottomSheet";
import { setLoginAuthToken } from "@/lib/api";

type LoginReason = "shortlist" | "contact" | "brochure";

type AuthContextValue = {
  isLoggedIn: boolean;
  requireLogin: (reason: LoginReason) => Promise<boolean>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

async function postAck(path: string, body: unknown): Promise<{ success: true; login_auth_token?: string }> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  const payload = await res.json();
  if (
    payload &&
    typeof payload === "object" &&
    "data" in payload &&
    ("statusCode" in payload || "responseCode" in payload)
  ) {
    return payload.data as { success: true; login_auth_token?: string };
  }
  return payload as { success: true; login_auth_token?: string };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginReason, setLoginReason] = useState<LoginReason | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  const close = useCallback(() => {
    setLoginReason(null);
    if (resolveRef.current) {
      resolveRef.current(false);
      resolveRef.current = null;
    }
  }, []);

  const requireLogin = useCallback(
    async (reason: LoginReason): Promise<boolean> => {
      if (isLoggedIn) return true;
      return new Promise<boolean>((resolve) => {
        resolveRef.current = resolve;
        setLoginReason(reason);
      });
    },
    [isLoggedIn]
  );

  const handleLoggedIn = useCallback(async () => {
    // Mock login API
    const res = await postAck("/api/auth/login", { ok: true });
    const token = res.login_auth_token ?? "mock_login_auth_token";
    setLoginAuthToken(token);
    window.dispatchEvent(new CustomEvent("chat:login-success", { detail: { login_auth_token: token } }));
    setIsLoggedIn(true);
    setLoginReason(null);
    if (resolveRef.current) {
      resolveRef.current(true);
      resolveRef.current = null;
    }
  }, []);

  const value = useMemo<AuthContextValue>(() => ({ isLoggedIn, requireLogin }), [isLoggedIn, requireLogin]);

  return (
    <AuthContext.Provider value={value}>
      {children}
      <LoginBottomSheet
        open={loginReason !== null}
        reason={loginReason}
        onClose={close}
        onLoggedIn={handleLoggedIn}
      />
    </AuthContext.Provider>
  );
}

