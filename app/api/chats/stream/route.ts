import { NextRequest } from "next/server";
import { subscribeSSE, hasPendingRequest } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LOG_PREFIX = "[SSE]";

// Connection Lifecycle (architecture §7 BE): close if no activity > 15s AND no pending ML, or no activity > 60s overall
const IDLE_CLOSE_MS = 15_000;
const MAX_ACTIVITY_MS = 60_000;
const LIFECYCLE_CHECK_MS = 5_000;
const KEEPALIVE_MS = 30_000; // send keepalive when pending ML so we don't hit 60s close
export async function GET(request: NextRequest) {
  const conversationId = request.nextUrl.searchParams.get("conversationId");
  if (!conversationId) {
    return new Response("conversationId required", { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let lastActivity = Date.now();
      let lifecycleTimer: ReturnType<typeof setInterval> | null = null;

      const doClose = (sendCloseEvent?: boolean) => {
        if (closed) return;
        if (sendCloseEvent) {
          try {
            controller.enqueue(encoder.encode("event: connection_close\ndata: {\"reason\":\"lifecycle\"}\n\n"));
          } catch (_) {}
        }
        closed = true;
        if (lifecycleTimer) clearInterval(lifecycleTimer);
        lifecycleTimer = null;
        unsubscribe();
        try {
          controller.close();
        } catch (_) {}
        console.log(LOG_PREFIX, "connection closed", { conversationId });
      };

      const write = (chunk: string) => {
        if (closed) return;
        lastActivity = Date.now();
        try {
          controller.enqueue(encoder.encode(chunk));
          console.log(LOG_PREFIX, "data written", { conversationId, chunkLength: chunk.length });
        } catch (e) {
          console.warn(LOG_PREFIX, "write failed", { conversationId, error: e });
          doClose();
        }
      };

      console.log(LOG_PREFIX, "new connection", { conversationId });

      // Send initial comment to keep connection alive and allow client to detect open
      write(": connected\n\n");

      const unsubscribe = subscribeSSE(conversationId, (data) => {
        write(data);
      });

      const checkLifecycle = () => {
        if (closed) return;
        const now = Date.now();
        const idleMs = now - lastActivity;
        const pending = hasPendingRequest(conversationId);

        if (idleMs >= MAX_ACTIVITY_MS) {
          console.log(LOG_PREFIX, "closing: no activity > 60s", { conversationId });
          doClose(true);
          return;
        }
        if (idleMs >= IDLE_CLOSE_MS && !pending) {
          console.log(LOG_PREFIX, "closing: no activity > 15s and no pending ML", {
            conversationId,
          });
          doClose(true);
          return;
        }
        // Keepalive while pending ML to avoid 60s close
        if (pending && idleMs >= KEEPALIVE_MS) {
          write(": keepalive\n\n");
        }
      };

      lifecycleTimer = setInterval(checkLifecycle, LIFECYCLE_CHECK_MS);

      request.signal.addEventListener("abort", () => {
        console.log(LOG_PREFIX, "connection aborted", { conversationId });
        doClose(false); // client closed, no need to send connection_close
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store, no-cache",
      Connection: "keep-alive",
    },
  });
}
