"use client";

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { LoginBottomSheet } from "@/components/chat/LoginBottomSheet";

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

async function postAck(path: string, body: unknown): Promise<{ success: true }> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
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
    await postAck("/api/auth/login", { ok: true });
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

