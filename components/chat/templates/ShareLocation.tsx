"use client";

import type { ChatEvent } from "@/lib/contract-types";
import { useEffect, useState } from "react";

interface Props {
  data: Record<string, unknown>;
  onUserAction: (event: ChatEvent) => void;
  conversationId?: string;
  disabled?: boolean;
}

export function ShareLocation({ data, onUserAction, disabled = false }: Props) {
  const [shouldRender, setShouldRender] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (disabled) return;
      if (typeof window === "undefined" || !("geolocation" in navigator)) return;

      // If the Permissions API exists and geolocation is already granted, auto-send and do not render.
      try {
        const perms = (navigator as unknown as { permissions?: Permissions }).permissions;
        if (!perms?.query) return;

        const status = await perms.query({ name: "geolocation" as PermissionName });
        if (cancelled) return;

        if (status.state === "granted") {
          setShouldRender(false);
          const result = await new Promise<{ ok: true; coords: [number, number] } | { ok: false }>((resolve) => {
            navigator.geolocation.getCurrentPosition(
              (pos) => resolve({ ok: true, coords: [pos.coords.latitude, pos.coords.longitude] }),
              () => resolve({ ok: false }),
              { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
            );
          });
          if (cancelled) return;
          if (!result.ok) return;

          // Send request to ML directly.
          onUserAction({
            sender: { type: "system" },
            payload: {
              messageType: "user_action",
              responseRequired: true,
              content: { data: { action: "location_shared", coordinates: result.coords } },
            },
          } as ChatEvent);
        }
      } catch {
        // If Permissions API isn't supported, fall back to rendering the CTA.
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [disabled, onUserAction]);

  if (!shouldRender) return null;

  return (
    <div className="w-full" data-demo="share-location">
      <p className="text-sm text-[#111] mb-3">I&apos;ll need permission for this:</p>

      <div className="rounded-2xl border border-[#E8E8E8] bg-white p-4">
        <div className="flex items-center gap-2 text-sm text-[#111]">
          <div className="w-7 h-7 rounded-full bg-[#F5F5F5] flex items-center justify-center flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </div>
          <span className="font-medium">Explore nearby properties</span>
        </div>

        <button
          type="button"
          disabled={disabled}
          onClick={async () => {
            if (disabled) return;
            if (typeof window === "undefined" || !("geolocation" in navigator)) {
              onUserAction({
                sender: { type: "system" },
                payload: {
                  messageType: "user_action",
                  responseRequired: true,
                  content: { data: { action: "location_denied" } },
                },
              } as ChatEvent);
              return;
            }

            const result = await new Promise<{ ok: true; coords: [number, number] } | { ok: false }>((resolve) => {
              navigator.geolocation.getCurrentPosition(
                (pos) => resolve({ ok: true, coords: [pos.coords.latitude, pos.coords.longitude] }),
                () => resolve({ ok: false }),
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
              );
            });

            if (!result.ok) {
              onUserAction({
                sender: { type: "system" },
                payload: {
                  messageType: "user_action",
                  responseRequired: true,
                  content: { data: { action: "location_denied" } },
                },
              } as ChatEvent);
              return;
            }

            onUserAction({
              sender: { type: "system" },
              payload: {
                messageType: "user_action",
                responseRequired: true,
                content: { data: { action: "location_shared", coordinates: result.coords } },
              },
            } as ChatEvent);
          }}
          className="mt-4 w-full h-10 rounded-lg bg-[#5E23DC] text-white text-sm font-semibold hover:bg-[#4a1bb5] transition-colors disabled:opacity-50"
        >
          Give location permission
        </button>
      </div>
    </div>
  );
}
