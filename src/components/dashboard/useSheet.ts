"use client";

import { createContext, useCallback, useEffect, useRef, useState, type SyntheticEvent } from "react";
import { usePathname } from "next/navigation";

/**
 * A native modal dialog that leaves the way it came: `hide` plays the element's `[data-closing]` animation, then
 * closes. Focus, Escape and the page behind come from the dialog itself. Navigating away closes it at once.
 */
export function useSheet() {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const show = useCallback(() => {
    ref.current?.showModal();
    setOpen(true);
  }, []);

  // Safe to call twice.
  const hide = useCallback(() => {
    const dialog = ref.current;
    if (!dialog?.open || "closing" in dialog.dataset) return;
    dialog.dataset.closing = "";
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      delete dialog.dataset.closing;
      dialog.close();
    };
    dialog.addEventListener("animationend", (e) => e.target === dialog && !e.pseudoElement && finish(), { once: true });
    setTimeout(finish, 360); // In case no animation runs.
  }, []);

  // Back or forward while it's open: the new page shouldn't open under it.
  useEffect(() => {
    const dialog = ref.current;
    if (dialog?.open) dialog.close();
  }, [pathname]);

  /** Spread onto the <dialog>. */
  const dialogProps = {
    ref,
    onClose: () => setOpen(false),
    onCancel: (e: SyntheticEvent) => {
      // Escape: leave the way it came.
      e.preventDefault();
      hide();
    },
  };

  return { ref, open, show, hide, dialogProps };
}

/** Closes the sheet a control sits in, if any: a jump of the demo clock from the menu shows its result on the page. */
export const CloseSheet = createContext<(() => void) | null>(null);
