"use client";

import { useFormStatus } from "react-dom";
import { enterDemo } from "@/app/dashboard/actions";
import { cx } from "@/components/ui/cx";
import { IconArrowRight } from "@/components/ui/Icons";

/**
 * "Enter the clinic dashboard" in one click: signs in as Dana and opens Today, with no second door to pass.
 * The header keeps a plain link to the sign-in page, so it can still open in a new tab.
 */
export function EnterDemo({ className, buttonClassName }: { className?: string; buttonClassName?: string }) {
  return (
    <form action={enterDemo} className={className}>
      <Submit className={buttonClassName} />
    </form>
  );
}

function Submit({ className }: { className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={cx("btn-gold group w-full gap-2.5 whitespace-nowrap disabled:cursor-progress", className)}>
      {pending ? "Opening the dashboard" : "Enter the clinic dashboard"}
      <IconArrowRight width={18} height={18} className="transition-transform duration-300 ease-out group-hover:translate-x-1" />
    </button>
  );
}
