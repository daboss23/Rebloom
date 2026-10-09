"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonVariant } from "@/components/ui/Button";

/** A form's submit button that says what it's doing while the server works. Plain submit without JavaScript. */
export function PendingButton({ children, pending, variant, block, className }: { children: string; pending: string; variant?: ButtonVariant; block?: boolean; className?: string }) {
  const status = useFormStatus();
  return (
    <Button type="submit" variant={variant} block={block} disabled={status.pending} aria-busy={status.pending} className={className}>
      {status.pending ? pending : children}
    </Button>
  );
}
