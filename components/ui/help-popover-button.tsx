"use client";

import { HelpCircle } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

type HelpPopoverButtonProps = {
  detail: string;
  align?: "left" | "right";
  className?: string;
};

const popoverBaseClass =
  "absolute top-7 z-30 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs leading-relaxed text-zinc-200 shadow-xl";

export function HelpPopoverButton({
  detail,
  align = "right",
  className = "",
}: HelpPopoverButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const hintId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current) return;
      if (!(event.target instanceof Node)) return;
      if (!rootRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={rootRef} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        className="inline-flex size-5 items-center justify-center rounded-full border border-zinc-700 text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-200"
        aria-label="Show helper details"
        aria-expanded={isOpen}
        aria-controls={hintId}
        onClick={() => {
          setIsOpen((prev) => !prev);
        }}
      >
        <HelpCircle className="size-3.5" />
      </button>
      {isOpen ? (
        <div
          id={hintId}
          role="note"
          className={`${popoverBaseClass} ${align === "left" ? "left-0" : "right-0"}`}
        >
          {detail}
        </div>
      ) : null}
    </div>
  );
}
