"use client";

import type { ChatEventFromUser } from "@/lib/contract-types";
import { useToast } from "@/components/ui/ToastProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { useEffect, useRef } from "react";

function emitLoginFailed(onUserAction: (event: ChatEventFromUser) => void) {
  onUserAction({
    sender: { type: "system" },
    messageType: "user_action",
    responseRequired: false,
    visibility: "shown",
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
  return res.json();
}

export function ShortlistProperty({ data, messageId, onUserAction, disabled = false }: Props) {
  const toast = useToast();
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
      const ok = await auth.requireLogin("shortlist");
      if (!ok) {
        emitLoginFailed(onUserAction);
        return;
      }
      try {
        await postAck("/api/properties/shortlist", { propertyId });
        toast.show("Property has been shortlisted");
      } catch (e) {
        console.error(e);
        toast.show("Could not shortlist. Please try again.");
        return;
      }

      onUserAction({
        sender: { type: "system" },
        messageType: "user_action",
        visibility: "shown",
        responseRequired: false,
        content: {
          data: {
            action: "shortlist",
            replyToMessageId: messageId,
            property: { id: propertyId, type } as PropertyMeta,
          },
          derivedLabel: "You've shortlisted this property. check it out in User Profile -> Saved properties",
        },
      } as unknown as ChatEventFromUser);
    })();
  }, [auth, disabled, messageId, onUserAction, propertyId, toast, type]);

  return null;
}
