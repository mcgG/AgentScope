import type { AgentEvent } from "@shared/events.ts";
import { CardShell } from "./CardShell.tsx";
import { RawEventViewer } from "./RawEventViewer.tsx";
import { classNames } from "../../utils.ts";

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}
function asStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

type Todo = {
  content: string;
  activeForm?: string;
  status: "pending" | "in_progress" | "completed" | string;
};

function parseTodos(input: unknown): Todo[] {
  const obj = asObj(input);
  return asArr(obj.todos).map((t) => {
    const o = asObj(t);
    return {
      content: asStr(o.content),
      activeForm: asStr(o.activeForm) || undefined,
      status: asStr(o.status) || "pending",
    };
  });
}

export function TodoWriteCard({ event }: { event: AgentEvent }) {
  const todos = parseTodos(event.input);
  const counts = {
    completed: todos.filter((t) => t.status === "completed").length,
    inProgress: todos.filter((t) => t.status === "in_progress").length,
    pending: todos.filter((t) => t.status === "pending").length,
  };

  return (
    <CardShell
      event={event}
      icon={<ChecklistIcon />}
      title="Todo list"
      subtitle={
        <span className="font-mono text-[11px] text-zinc-500">
          <span className="text-emerald-400">{counts.completed} done</span>
          {" · "}
          <span className="text-blue-400">{counts.inProgress} active</span>
          {" · "}
          <span className="text-zinc-400">{counts.pending} pending</span>
        </span>
      }
    >
      <div className="px-3 pb-3 space-y-1">
        {todos.map((t, i) => (
          <TodoRow key={i} todo={t} />
        ))}
        {todos.length === 0 && (
          <div className="text-[12px] text-zinc-500 italic">
            (no todos in this update)
          </div>
        )}
      </div>
      <RawEventViewer event={event} />
    </CardShell>
  );
}

function TodoRow({ todo }: { todo: Todo }) {
  const isDone = todo.status === "completed";
  const isActive = todo.status === "in_progress";
  const display =
    isActive && todo.activeForm ? todo.activeForm : todo.content;
  return (
    <div
      className={classNames(
        "flex items-start gap-2 rounded px-2 py-1",
        isActive && "bg-blue-500/5",
      )}
    >
      <CheckBox
        state={isDone ? "done" : isActive ? "active" : "pending"}
      />
      <div
        className={classNames(
          "text-[13px] leading-5 break-words flex-1",
          isDone && "line-through text-zinc-500",
          isActive && "text-blue-200",
          !isDone && !isActive && "text-zinc-200",
        )}
      >
        {display}
      </div>
    </div>
  );
}

function CheckBox({ state }: { state: "done" | "active" | "pending" }) {
  if (state === "done") {
    return (
      <span className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded border border-emerald-500/50 bg-emerald-500/15">
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-emerald-300"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded border border-blue-400/60 bg-blue-500/20">
        <span className="size-1.5 rounded-full bg-blue-300 animate-pulse" />
      </span>
    );
  }
  return (
    <span className="mt-0.5 inline-block size-4 shrink-0 rounded border border-zinc-600 bg-zinc-900" />
  );
}

function ChecklistIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-emerald-300"
    >
      <path d="M3 17l2 2 4-4" />
      <path d="M3 7l2 2 4-4" />
      <path d="M13 6h8" />
      <path d="M13 12h8" />
      <path d="M13 18h8" />
    </svg>
  );
}
