// The way out of the clinic's emails (DECISIONS D-086): the page the link at the foot of every reminder opens. One
// button, no sign-in, nothing to type. It works without JavaScript, since mail apps often open links in a bare view.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Bloom } from "@/components/dashboard/Bloom";
import { PendingButton } from "@/components/flow/PendingButton";
import { ButtonLink } from "@/components/ui/Button";
import { Hairline, Label } from "@/components/ui/Typography";
import { clientIdFromUnsubscribeToken, emailPreference } from "@/lib/email/unsubscribe";
import { loadClinic } from "@/lib/flow/load";
import { keepEmails, unsubscribe } from "./actions";

export async function generateMetadata({ params }: PageProps<"/c/[clinicSlug]/unsubscribe/[token]">): Promise<Metadata> {
  const clinic = await loadClinic((await params).clinicSlug);
  return { title: `Email updates · ${clinic.name}`, robots: { index: false, follow: false } };
}

export default async function UnsubscribePage({ params, searchParams }: PageProps<"/c/[clinicSlug]/unsubscribe/[token]">) {
  const { clinicSlug, token } = await params;
  const clinic = await loadClinic(clinicSlug);
  const clientId = clientIdFromUnsubscribeToken(token);
  if (!clientId) notFound();
  const preference = await emailPreference(clinic, clientId);
  const kept = (await searchParams).kept === "1";

  // Deleted their data, or the address is gone: nothing left to email.
  if (!preference) {
    return (
      <div className="focus-in pt-12">
        <Label>Email updates</Label>
        <h1 className="t-h1 mt-4">Nothing to unsubscribe.</h1>
        <p className="t-body mt-5">{clinic.name} no longer holds your details, so no more emails will come.</p>
        <ButtonLink href={`/c/${clinic.slug}`} variant="secondary" block className="mt-10">
          Back to {clinic.name}
        </ButtonLink>
      </div>
    );
  }

  const { client, unsubscribedAt, texts } = preference;
  const address = <span className="text-ink [overflow-wrap:anywhere]">{client.email}</span>;
  const stillComes = "Emails about a visit you book, and our answers when you write to us, still reach you.";
  const demo = client.isDemo && (
    <p className="t-caption mt-6 text-center">
      Rebloom demo: {client.firstName} is a sample client. Their row in the demo dashboard changes with what you choose here.
    </p>
  );

  if (unsubscribedAt) {
    return (
      <div className="pt-10">
        <section aria-labelledby="unsubscribe-title" className="glass focus-in p-6 sm:p-8" role="status">
          <Label>Email updates</Label>
          <h1 id="unsubscribe-title" className="t-h1 mt-4">
            You&apos;re unsubscribed.
          </h1>
          <p className="t-body mt-5">
            {clinic.name} won&apos;t email reminders or progress updates to {address}.
          </p>
          <p className="t-caption mt-3">{stillComes}</p>
          {texts && <p className="t-caption mt-3">Texts are separate. Reply STOP to any text from us to stop those too.</p>}
          <Hairline className="mt-8" />
          <form action={keepEmails.bind(null, clinic.slug, token)} className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="t-body">Unsubscribed by mistake?</p>
            <PendingButton variant="secondary" pending="Saving" className="sm:min-w-52">
              Keep getting emails
            </PendingButton>
          </form>
        </section>
        {demo}
      </div>
    );
  }

  if (kept) {
    return (
      <div className="pt-10">
        <section aria-labelledby="unsubscribe-title" className="glass focus-in p-6 sm:p-8" role="status">
          <span
            aria-hidden
            className="grid h-14 w-14 place-items-center rounded-full bg-[radial-gradient(circle_at_30%_30%,#fff_0%,#ffe4d8_55%,#f4b9a3_100%)] shadow-[0_14px_30px_-16px_rgba(158,74,93,0.6)] ring-1 ring-white"
          >
            <Bloom size={30} unfurl className="text-[#9e4a5d]" />
          </span>
          <h1 id="unsubscribe-title" className="t-h1 mt-6">
            You&apos;ll keep hearing from us.
          </h1>
          <p className="t-body mt-5">
            {clinic.name} will email your reminders and progress updates to {address}. Each one has a link to stop them.
          </p>
          <form action={unsubscribe.bind(null, clinic.slug, token)} className="mt-6">
            <PendingButton variant="quiet" pending="Unsubscribing" className="!px-0">
              Unsubscribe after all
            </PendingButton>
          </form>
        </section>
        {demo}
      </div>
    );
  }

  return (
    <div className="pt-10">
      <section aria-labelledby="unsubscribe-title" className="glass focus-in p-6 sm:p-8">
        <Label>Email updates</Label>
        <h1 id="unsubscribe-title" className="t-h1 mt-4 [text-wrap:balance]">
          Stop emails from {clinic.name}?
        </h1>
        <p className="t-body mt-5">Reminders and progress updates will stop coming to {address}.</p>
        <p className="t-caption mt-3">{stillComes}</p>
        <form action={unsubscribe.bind(null, clinic.slug, token)} className="mt-8">
          <PendingButton block pending="Unsubscribing" className="!min-h-14 text-[1rem]">
            Unsubscribe
          </PendingButton>
        </form>
      </section>
      {demo}
    </div>
  );
}
