"use client";

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

type ToastItem = { id: string; message: string };

type ToastContextValue = {
  show: (message: string) => void;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    const timer = toastTimersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      toastTimersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((message: string) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setToasts((prev) => [...prev, { id, message }]);
    const timer = setTimeout(() => dismiss(id), 3000);
    toastTimersRef.current.set(id, timer);
  }, [dismiss]);

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* Toast notifications – scout-bot login toast style */}
      <div
        className="fixed bottom-24 left-1/2 -translate-x-1/2 flex flex-col gap-2 z-50 pointer-events-none"
        style={{ maxWidth: "380px", width: "calc(100% - 32px)" }}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="flex items-center justify-between gap-3 px-4 py-3 bg-[#111] text-white rounded-2xl shadow-lg pointer-events-auto login-closed-toast"
          >
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <span className="w-5 h-5 rounded-full flex items-center justify-center bg-[#0F8458] flex-shrink-0">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </span>
              <span className="text-sm font-medium truncate">{toast.message}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="w-px h-5 bg-white/30" />
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="text-white/80 hover:text-white transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

