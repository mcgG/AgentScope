import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AgentEvent } from "@shared/events.ts";
import { EventCard } from "./cards/EventCard.tsx";

const PIN_THRESHOLD_PX = 80;

export function Timeline({ events }: { events: AgentEvent[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);
  const [unread, setUnread] = useState(0);
  const lastEventCount = useRef(events.length);
  const lastSessionEventId = useRef<string | undefined>(events[0]?.sessionId);

  const isAtBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < PIN_THRESHOLD_PX;
  }, []);

  const scrollToBottom = useCallback(
    (smooth = true) => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTo({
        top: el.scrollHeight,
        behavior: smooth ? "smooth" : "auto",
      });
      setUnread(0);
      setPinned(true);
    },
    [],
  );

  // Reset state when switching sessions (first event's sessionId changes).
  useEffect(() => {
    const sid = events[0]?.sessionId;
    if (sid !== lastSessionEventId.current) {
      lastSessionEventId.current = sid;
      setUnread(0);
      setPinned(true);
      requestAnimationFrame(() => scrollToBottom(false));
    }
  }, [events, scrollToBottom]);

  // When new events arrive, auto-scroll only if pinned, else bump unread count.
  useLayoutEffect(() => {
    const delta = events.length - lastEventCount.current;
    lastEventCount.current = events.length;
    if (delta <= 0) return;
    if (pinned) {
      scrollToBottom(true);
    } else {
      setUnread((u) => u + delta);
    }
  }, [events.length, pinned, scrollToBottom]);

  const onScroll = useCallback(() => {
    const atBottom = isAtBottom();
    setPinned((prev) => {
      if (atBottom && !prev) {
        setUnread(0);
        return true;
      }
      if (!atBottom && prev) return false;
      return prev;
    });
  }, [isAtBottom]);

  if (events.length === 0) {
    return (
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto flex items-center justify-center text-xs text-zinc-500"
      >
        Waiting for events…
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="flex-1 overflow-auto relative"
    >
      <div className="flex flex-col gap-3 px-6 py-4">
        {events.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>
      {!pinned && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          aria-label="Scroll to latest"
          className="sticky bottom-5 ml-auto mr-5 flex items-center gap-1.5 rounded-full bg-blue-500/90 hover:bg-blue-400 text-white text-xs font-medium pl-2 pr-3 py-1.5 shadow-lg shadow-blue-900/40 ring-1 ring-blue-400/40 backdrop-blur-sm transition-colors float-right -translate-y-1"
        >
          <ArrowDownIcon />
          {unread > 0 ? (
            <span>
              {unread} new event{unread === 1 ? "" : "s"}
            </span>
          ) : (
            <span>Jump to latest</span>
          )}
        </button>
      )}
    </div>
  );
}

function ArrowDownIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 5v14" />
      <path d="m19 12-7 7-7-7" />
    </svg>
  );
}
