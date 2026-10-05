import type { Metadata } from "next";
import { Label } from "@/components/ui/Typography";
import { RebloomWordmark } from "@/components/ui/Wordmarks";
import { YouCamCheck } from "./YouCamCheck";

export const metadata: Metadata = { title: "YouCam connection · Rebloom", robots: { index: false, follow: false } };

/** For the team: is YouCam connected on this deploy? The page shows nothing without the CRON_SECRET. */
export default function YouCamSetupPage() {
  return (
    <main className="mx-auto max-w-[560px] px-5 py-10">
      <RebloomWordmark />
      <Label className="mt-14">Setup</Label>
      <h1 className="t-h1 mt-3">YouCam connection</h1>
      <p className="t-body mt-4">
        Checks that this site can reach YouCam with its key. It only reads your unit balance, which costs nothing.
      </p>
      <YouCamCheck />
      <p className="t-caption mt-12">
        The password is the CRON_SECRET value in Vercel&apos;s environment variables. It goes only to this site, and
        isn&apos;t saved anywhere.
      </p>
    </main>
  );
}
