"use client";

import type { ChatEvent } from "@/lib/contract-types";
import { useAuth } from "@/components/auth/AuthProvider";
import { useEffect, useRef } from "react";

function emitLoginFailed(onUserAction: (event: ChatEvent) => void) {
  onUserAction({
    sender: { type: "system" },
    payload: {
      messageType: "user_action",
      responseRequired: false,
      visibility: "shown",
      content: {
        data: { action: "location_denied" },
        derivedLabel: "Login Failed. Can't proceed without logging in!",
      },
    },
  } as ChatEvent);
}

type PropertyMeta = {
  propertyId?: string;
  service?: string;
  category?: string;
  type?: string;
};

interface Props {
  data: Record<string, unknown>;
  messageId: string;
  onUserAction: (event: ChatEvent) => void;
  disabled?: boolean;
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

export function ContactSeller({
  data,
  messageId,
  onUserAction,
  disabled = false,
}: Props) {
  const auth = useAuth();
  const propertyId = (data.propertyId as string | undefined) ?? "";
  const service = (data.service as string | undefined) ?? "buy";
  const category = (data.category as string | undefined) ?? "residential";
  const type = (data.type as string | undefined) ?? "project";

  const startedRef = useRef(false);

  useEffect(() => {
    if (!propertyId) return;
    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      const ok = await auth.requireLogin("contact");
      if (!ok) {
        emitLoginFailed(onUserAction);
        return;
      }
      try {
        await postAck("/api/properties/contact-seller", { propertyId });
      } catch (e) {
        console.error(e);
        return;
      }

      onUserAction({
        sender: { type: "system" },
        payload: {
          messageType: "user_action",
          responseRequired: false,
          visibility: "shown",
          content: {
            data: {
              action: "crf_submitted",
              messageId,
              property: { propertyId, service, category, type },
            },
            derivedLabel: "The seller has been contacted, someone will reach out to you soon!",
          },
        },
      } as ChatEvent);
    })();
  }, [auth, category, disabled, messageId, onUserAction, propertyId, service, type]);

  return null;
}

