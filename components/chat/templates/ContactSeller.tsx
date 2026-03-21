"use client";

import type { ChatEvent } from "@/lib/contract-types";
import { useAuth } from "@/components/auth/AuthProvider";
import { useEffect, useRef } from "react";

function emitLoginFailed(onUserAction: (event: ChatEvent) => void) {
  onUserAction({
    sender: { type: "system" },
    messageType: "user_action",
    responseRequired: false,
    visibility: "shown",
    content: {
      data: { action: "location_denied" },
      derivedLabel: "Login Failed. Can't proceed without logging in!",
    },
  } as ChatEvent);
}

type PropertyMeta = {
  id?: string;
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
  const property = (data.property as PropertyMeta | undefined) ?? undefined;
  const propertyId = property?.id ?? "";
  const type = property?.type ?? "project";

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
        messageType: "user_action",
        responseRequired: false,
        visibility: "shown",
        content: {
          data: {
            action: "crf_submitted",
            replyToMessageId: messageId,
            property: { id: propertyId, type } as PropertyMeta,
          },
          derivedLabel: "The seller has been contacted, someone will reach out to you soon!",
        },
      } as ChatEvent);
    })();
  }, [auth, disabled, messageId, onUserAction, propertyId, type]);

  return null;
}

