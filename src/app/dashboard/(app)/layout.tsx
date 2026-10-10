import type { Metadata } from "next";
import { Shell } from "@/components/dashboard/Shell";
import { loadBook } from "@/lib/dashboard/load";
import { newClients, waitingReplies } from "@/lib/dashboard/live";
import { clientRows, shortDay } from "@/lib/dashboard/view";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: { default: "Today · Rebloom", template: "%s · Rebloom" },
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const book = await loadBook();
  return (
    <Shell
      clinic={book.clinic}
      staff={book.staff}
      dateLabel={shortDay(book.today)}
      offsetDays={book.offsetDays}
      demo={env.DEMO_MODE}
      queueCount={book.queue.items.length}
      clientCount={clientRows(book.facts, book.queue, book.now, book.clinic.timezone).length}
      waiting={waitingReplies(book.input.clients, book.input.messages)}
      arrivals={newClients(book.input.clients)}
    >
      {children}
    </Shell>
  );
}
