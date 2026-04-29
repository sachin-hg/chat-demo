"use client";

import type { ChatEventFromUser } from "@/lib/contract-types";
import { useAuth } from "@/components/auth/AuthProvider";
import { useEffect, useRef } from "react";

function emitLoginFailed(onUserAction: (event: ChatEventFromUser) => void) {
  onUserAction({
    sender: { type: "system" },
    messageType: "user_action",
    responseRequired: false,
    isVisible: true,
    content: {
      data: { action: "location_denied" },
      derivedLabel: "Login Failed. Can't proceed without logging in!",
    },
  } as unknown as ChatEventFromUser);
}

type PropertyMeta = {
  id?: string;
  type?: string;
};

interface Props {
  data: Record<string, unknown>;
  messageId: string;
  onUserAction: (event: ChatEventFromUser) => void;
  disabled?: boolean;
}

async function postAck(path: string, body: unknown): Promise<{ success: true }> {
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
    return payload.data as { success: true };
  }
  return payload as { success: true };
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
        isVisible: true,
        content: {
          data: {
            action: "contacted_seller",
            replyToMessageId: messageId,
            property: { id: propertyId, type } as PropertyMeta,
          },
          derivedLabel: "The seller has been contacted, someone will reach out to you soon!",
        },
      } as unknown as ChatEventFromUser);
    })();
  }, [auth, disabled, messageId, onUserAction, propertyId, type]);

  return null;
}

