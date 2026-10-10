import type { ReactNode } from "react";
import { IconAlert } from "./Icons";

/** A problem with what was entered, and what to do about it: amber glass, announced when it appears. */
export function FormAlert({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <p id={id} role="alert" className="flex items-start gap-3 rounded-[14px] bg-[#e9a35f]/[0.14] px-4 py-3 text-[0.90625rem] leading-relaxed text-[#7a4210] ring-1 ring-inset ring-[#e9a35f]/30">
      <IconAlert aria-hidden width={18} height={18} className="mt-[2px] shrink-0" />
      <span>{children}</span>
    </p>
  );
}
