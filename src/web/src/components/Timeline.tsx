import { useEffect, useRef } from "react";
import type { AgentEvent } from "@shared/events.ts";
import { EventCard } from "./cards/EventCard.tsx";

export function Timeline({
  events,
  autoScroll,
}: {
  events: AgentEvent[];
  autoScroll: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastEventCount = useRef(events.length);

  useEffect(() => {
    if (autoScroll && events.length > lastEventCount.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
    lastEventCount.current = events.length;
  }, [events.length, autoScroll]);

  if (events.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-zinc-500">
        Waiting for events…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-6 py-4">
      {events.map((event) => (
        <EventCard key={event.id} event={event} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
