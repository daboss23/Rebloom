import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Checkbox, FieldLabel, TextArea, TextInput } from "@/components/ui/Field";
import { IconAlert, IconArrowLeft, IconArrowRight, IconCamera, IconCheckCircle, IconCopy, IconLock, IconSun, IconUpload } from "@/components/ui/Icons";
import { Hairline, ImagePlaceholder, Label, ScoreNumber } from "@/components/ui/Typography";
import { ScoreRuler } from "@/components/ui/ScoreRuler";
import { ClinicWordmark, PoweredByRebloom, RebloomWordmark } from "@/components/ui/Wordmarks";
import { SEED_CLINICS } from "@/data/clinics";
import { clinicThemeStyle, contrastRatio, onAccent } from "@/lib/brand";
import { ChipDemo } from "./ChipDemo";

export const metadata: Metadata = { title: "Components · Rebloom", robots: { index: false } };

const TOKENS = [
  ["Porcelain", "#F7F4EF", "--bg"],
  ["Ink", "#1C1C1A", "--ink"],
  ["Champagne", "#C9B79C", "--accent"],
  ["Mist", "#E6E2DA", "--surface"],
  ["Sage grey", "#8C9A8F", "--detail"],
  ["Secondary text", "#3F4440", "--text-2"],
  ["Caption text", "#5E655F", "--text-3"],
  ["Bronze", "#9C7A54", "--bronze"],
  ["Soft ink", "#C9C3B8", "--ink-soft"],
] as const;

/** A private gallery of every base component. Hidden on the production deploy. */
export default function ComponentGallery() {
  if (process.env.VERCEL_ENV === "production") notFound();
  return (
    <main className="mx-auto max-w-3xl px-5 py-12 space-y-16">
      <header>
        <Label>Rebloom design system</Label>
        <h1 className="t-h1 mt-3">Components</h1>
        <p className="t-body mt-3">Every base component, on porcelain and on ink. For checking fonts and colors on real phones.</p>
      </header>

      <section className="space-y-4">
        <h2 className="t-h2">Color tokens</h2>
        <ul className="grid grid-cols-3 gap-3">
          {TOKENS.map(([name, hex, token]) => (
            <li key={token} className="border border-mist">
              <span className="block h-16" style={{ background: hex }} />
              <span className="block p-2 text-[0.8125rem] text-ink">{name}</span>
              <span className="block px-2 pb-2 t-caption">
                {hex} · {token}
              </span>
            </li>
          ))}
        </ul>
        <p className="t-caption">
          Caption text on porcelain: {contrastRatio("#5E655F", "#F7F4EF").toFixed(1)}:1. Champagne on porcelain:{" "}
          {contrastRatio("#C9B79C", "#F7F4EF").toFixed(1)}:1, which is why it&apos;s never used for text.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="t-h2">Type</h2>
        <p className="t-label">Label · 11px uppercase</p>
        <p className="t-h1">See your skin clearly.</p>
        <p className="t-h2">Your three priorities</p>
        <p className="t-h3">Texture</p>
        <p className="t-body">Body copy. Calm, precise, unhurried. Short sentences, warm but never gushing.</p>
        <p className="t-caption">Caption text for meta information.</p>
        <p className="t-quote">&ldquo;My skin looks uneven in photos.&rdquo;</p>
        <div className="flex items-end gap-10">
          <ScoreNumber value={58} />
          <ScoreNumber value={71} size="md" />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="t-h2">Buttons</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button disabled>Disabled</Button>
          <Button variant="quiet">Quiet link</Button>
        </div>
        <div className="bg-ink on-dark p-6 grid sm:grid-cols-2 gap-3">
          <Button variant="onDark">Book your first session</Button>
          <Button variant="secondaryOnDark">See other times</Button>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="t-h2">Chips, bars and dividers</h2>
        <ChipDemo />
        <ScoreRuler value={58} />
        <ScoreRuler value={71} />
        <Hairline />
      </section>

      <section className="space-y-6">
        <h2 className="t-h2">Fields</h2>
        <div>
          <FieldLabel htmlFor="demo-name">First name</FieldLabel>
          <TextInput id="demo-name" placeholder="Amelia" />
        </div>
        <div>
          <FieldLabel htmlFor="demo-goal" optional>
            In your own words
          </FieldLabel>
          <TextArea id="demo-goal" />
        </div>
        <Checkbox id="demo-check">I agree to the photo analysis described above.</Checkbox>
      </section>

      <section className="space-y-4">
        <h2 className="t-h2">Icons</h2>
        <div className="flex gap-5 text-ink">
          {[IconCheckCircle, IconAlert, IconArrowLeft, IconArrowRight, IconLock, IconCamera, IconUpload, IconSun, IconCopy].map((Icon, i) => (
            <Icon key={i} />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="t-h2">Brands</h2>
        <RebloomWordmark />
        <PoweredByRebloom />
        {SEED_CLINICS.map((clinic) => (
          <div key={clinic.id} style={clinicThemeStyle(clinic.accentHex)} className="border border-mist p-5 space-y-4">
            <ClinicWordmark clinic={clinic} />
            <ScoreRuler value={64} />
            <div className="bg-ink p-4">
              <Button variant="onDark" block>
                Book your first session
              </Button>
            </div>
            <p className="t-caption">
              Accent {clinic.accentHex}, text on accent {onAccent(clinic.accentHex)} (
              {contrastRatio(clinic.accentHex, onAccent(clinic.accentHex)).toFixed(1)}:1)
            </p>
          </div>
        ))}
      </section>

      <section className="space-y-4">
        <h2 className="t-h2">Placeholders</h2>
        <ImagePlaceholder caption="Your photo appears here" className="aspect-[3/4] max-w-xs" />
      </section>
    </main>
  );
}
