import { useState, type ReactNode } from "react";
import { classNames } from "../../utils.ts";

export function Collapsible({
  label,
  children,
  defaultOpen = false,
  count,
  rightSlot,
}: {
  label: string;
  children: ReactNode;
  defaultOpen?: boolean;
  count?: number | string;
  rightSlot?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-zinc-800/70">
      <div
        className={classNames(
          "flex items-center justify-between px-3 py-2 select-none",
        )}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <span
            className={classNames(
              "inline-block w-2 transition-transform",
              open ? "rotate-90" : "",
            )}
          >
            ▸
          </span>
          {label}
          {count != null && (
            <span className="text-[10px] text-zinc-500 font-normal">
              ({count})
            </span>
          )}
        </button>
        {rightSlot && <div className="flex gap-1">{rightSlot}</div>}
      </div>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}
