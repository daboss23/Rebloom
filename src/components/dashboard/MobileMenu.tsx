"use client";

import type { ReactNode } from "react";
import { CloseSheet, useSheet } from "./useSheet";

/**
 * The menu on phones and tablets: the desktop's deep-sea menu, sliding in from the edge its button sits on
 * and leaving the way it came. A native modal dialog, so focus, Escape and the page behind are handled for us.
 */
export function MobileMenu({ attention, children }: { attention: number; children: ReactNode }) {
  const { ref, open, show, hide, dialogProps } = useSheet();

  return (
    <>
      <button
        type="button"
        onClick={show}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="relative -mr-1.5 flex h-11 shrink-0 items-center gap-2.5 rounded-full px-3 text-[0.875rem] text-white transition-[background-color,transform] duration-150 ease-out hover:bg-white/10 active:scale-[0.96]"
      >
        <span className="sr-only sm:not-sr-only">Menu</span>
        <span aria-hidden className="relative flex w-5 flex-col items-end gap-[5px]">
          <span className="h-px w-5 bg-current" />
          <span className="h-px w-3.5 bg-current" />
        </span>
        {attention > 0 && (
          <>
            <span aria-hidden className="absolute right-1.5 top-2 h-1.5 w-1.5 rounded-full bg-[#e2c07a] shadow-[0_0_0_3px_#000]" />
            <span className="sr-only">
              , {attention} {attention === 1 ? "reply" : "replies"} waiting
            </span>
          </>
        )}
      </button>

      <dialog
        {...dialogProps}
        aria-label="Menu"
        onClick={(e) => {
          const target = e.target as Element;
          // The dimmed page, or a link inside: either way the menu's job is done.
          if (target === ref.current || target.closest("a")) hide();
        }}
        className="menu-sheet sea on-dark fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-dvh w-[min(86vw,360px)] max-w-none overflow-hidden rounded-l-[24px] border-0 p-0"
      >
        <div className="flex h-full flex-col overflow-y-auto overscroll-contain px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-7">
          <button
            type="button"
            onClick={hide}
            aria-label="Close menu"
            className="absolute right-3 top-4 grid h-11 w-11 place-items-center rounded-full text-ink-soft transition-[background-color,color] duration-150 hover:bg-white/10 hover:text-white"
          >
            <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round">
              <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
            </svg>
          </button>
          <CloseSheet.Provider value={hide}>{children}</CloseSheet.Provider>
        </div>
      </dialog>
    </>
  );
}
