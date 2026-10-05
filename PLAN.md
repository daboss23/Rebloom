# Maison Verre · Week 1 Plan

Written October 5, 2026, after reading `BRIEF.md` in full, the four-page mockup in `/reference` and the three logo files in `/brand`.

This document has four parts:

1. **Read this first:** things in the brief or mockup I think are wrong or risky, and the six decisions I need from you.
2. **Week 1 technical plan** (October 6 to 12).
3. **Folder structure.**
4. **Accounts and keys:** step-by-step setup for YouCam, Anthropic, Supabase, Resend, Stripe and Vercel, plus how to get keys to me safely.

If you only have ten minutes: read Part 1A, then do the checklist at the very end.

---

## Part 1 · Read this first

### 1A. Six decisions I need from you

These are expensive to reverse once code depends on them. My recommendation comes first in each.

| # | Decision | My recommendation | Why it matters |
|---|---|---|---|
| D1 | **Whose faces power the demo?** | Use **AI-generated synthetic portraits** for all seeded demo clients (including Amelia). Use your own face for live testing only, and never commit it to the repo. | The repo has to be public (MIT) or shared with Perfect Corp. Real faces plus skin scores in a public repo is exactly the biometric data our consent screen promises to protect. Stock photos are risky too: most stock licences forbid "sensitive use", which includes implying a real model has skin concerns. Synthetic faces sidestep both problems. |
| D2 | **What happens to judges' faces?** | Live scans from the public page are **visible only to the browser that made them**, never to other visitors in the shared "Enter demo as Dana" dashboard. Live-scan data auto-deletes 30 days after creation. | As written, judge A scans their face, then judge B clicks "Enter demo as Dana" and sees judge A's photo, name and email. That is a privacy failure in a product whose pitch is trust. |
| D3 | **How do we prove progress is real?** | Spend about 6 scans in Week 1 measuring YouCam's noise floor (same face, small changes in light), then set the "progress moment" and "stalled" thresholds from that data, not from the brief's guesses. Rescans must also match the first scan's light, not just pass a brightness check. | A previous entry in this same hackathon ("Same Light") published measurements showing that **lighting alone moved YouCam scores by up to 11 points** on unchanged skin. Our "progress moment" fires at 5 points. Without calibration, the engine will celebrate changes in the bathroom bulb. With calibration, it becomes our strongest credibility point in the README. |
| D4 | **Buy a domain?** (about $10 to $20 a year) | **Yes.** | Resend will only email *your own* address until a domain is verified. Without one, judges never receive their report link, and magic-link login can't reach anyone either. |
| D5 | **Extra YouCam units?** | Plan to buy the second 1,000 units ($179) around October 26, once we see real usage. Decide then, not now. | See the budget table in Part 2. After development, testing, fixtures and the video, roughly 30 live scans remain for judges. |
| D6 | **Is "Maison Verre" the product or the clinic?** | Keep **Maison Verre as the product**, keep the Maison Verre Santa Monica clinic as the hero demo, and add a **second demo clinic** with its own name, accent colour and wordmark, plus a small "Powered by Maison Verre" line on client pages. | The brief uses one name for both. Judges then can't see that the product is white-label, which is a core part of the business case. A second clinic makes it obvious in five seconds. |

### 1B. Conflicts between the brief and the mockup (I'll resolve these unless you object)

1. **The final peel on "Mon Jan 4" breaks two of our own rules.** January 4, 2027 is a Monday, and the clinic is closed Mondays (open Tue to Sat). Worse, a peel 7 days before the wedding violates the brief's guardrail of "no aggressive treatments in the 2 weeks before an event". If the AI made this recommendation, our own code would reject it. **Fix:** Dana's final recommendation becomes a Hydrating Infusion Facial on Tuesday January 5 ("one gentle facial before the big day"). Same emotional beat, and it shows the guardrail working.
2. **Budget doesn't match the bands.** The brief says Amelia picked "$1,000 to $2,000". The practitioner brief mockup shows "$800 to $1,200", which isn't one of the four intake options. **Fix:** use the band she actually picked.
3. **The "Full analysis" list in the mockup names concerns YouCam doesn't measure.** "Fine lines" and "Evenness" don't exist in the SD concern list, and upper/lower eyelid firmness and under-eye hollows (`tear_trough`) are missing. **Fix:** the list shows exactly what the API returned, with our friendly names. Every number stays real.
4. **"In her words" needs a question we don't ask.** The four intake questions are all tap-to-answer, so there is no quote to show. **Fix:** add one optional free-text question: "In your own words, what would you like to see change?" Also, the label becomes "In Amelia's words", because "her" won't be right for every client.
5. **Age is shown but never collected.** The brief shows "34". **Fix:** add an optional age-range question to intake.
6. **Two different totals.** The client report says "Estimated total $980" (treatments only). The practitioner brief says "Plan value $1,090" (treatments plus home care). Both are fine, but the labels must make the difference obvious. **Fix:** "Treatments $980" on the client report with home care listed separately; "Plan value incl. home care $1,090" on the brief.
7. **Displayed score changes versus measured changes.** The brief says clients see `ui_score` but all progress maths uses `raw_score`. If the progress page shows "58 → 71, +13" in ui scores while a trigger fires (or doesn't) on raw scores, the two can disagree in front of the client. **Fix:** clients see ui scores and ui arithmetic (so the numbers add up), but a concern only gets a celebration or "+13" badge when its **raw** change clears the calibrated threshold. If the two ever point in opposite directions, the copy goes neutral ("holding steady"). The practitioner brief shows both.
8. **"Skin age" should stay practitioner-only.** Telling a 34-year-old their skin looks 41 is the opposite of our voice rules ("never shame"). It stays in the practitioner brief only.
9. **Our banned-word list collides with our own required copy.** "Diagnosis" is banned, but the mandatory footer says "not a medical diagnosis". "Treat [a condition]" is banned, but "treatment" is everywhere. **Fix:** the copy checker uses phrase patterns plus an allowlist for fixed legal text, rather than a blunt word match.
10. **All the demo dates will be in the past or wrong by judging time.** Amelia's scan is October 5, her progress scan is December 28, and judges look in November. **Fix:** a "virtual clock" from Day 1. Every date in the app is computed from `clock.now()`, which in demo mode can be set or moved forward. This also makes the Week 3 time-travel control almost free. Retrofitting it later would mean touching every date calculation.
11. **The data model is missing a few things the features need.** No clinic opening hours or booking slots (needed for "next available time"). No treatment metadata for the pre-event rule (downtime, minimum days before an event). No way to express "4 to 6 weeks" intervals or "monthly, ongoing" courses. No scan status for the async pipeline. I'll add these in the first migration.
12. **YouCam API version.** The brief describes v2.0 with `mask_urls`. Other recent projects use **v2.1**, which returns a zip with `score_info.json` and per-concern mask images, and supports webhooks. I'll build to whatever the current official docs say on Day 4 and record the choice in `DECISIONS.md`.

### 1C. Technical risks and how the plan handles them

| Risk | What I'll do |
|---|---|
| **Vercel's 4.5 MB upload limit** and function time limits | The phone uploads the photo straight to private Supabase Storage via a one-time signed URL; it never passes through our server. YouCam polling is driven by the browser (one quick status check per request), so no server function ever waits minutes. |
| **Supabase's free plan pauses a project after about a week with no activity.** Judging runs for weeks after November 2. | A daily scheduled job pings the database. Safer option: upgrade to Supabase Pro ($25) for the judging month only. I'll remind you on November 1. |
| **Supabase's built-in email only reaches your own team's addresses** | Magic-link login sends through Resend instead (needs D4). The "Enter demo as Dana" button doesn't use email at all, so judges are never blocked. |
| **The camera gate could frustrate real people.** Seven checks at once on an older iPhone in a dim bathroom. | Thresholds live in one config file, checks run about 5 times a second rather than every frame, and after 20 seconds of not passing we offer "Upload a photo instead". |
| **Cameras don't work inside Instagram and Gmail's in-app browsers.** That's how many people open links. | Detect in-app browsers and show "Open in Safari" or "Open in Chrome" with a copy-link button. Upload remains available. |
| **This cloud workspace can't reach YouCam, Supabase, Stripe, Resend or Vercel** (I tested it). It can reach npm and Anthropic. | Part 4, step 7: you allow a short list of domains in this environment's settings. Live phone testing always happens on a real Vercel deployment anyway, because cameras need HTTPS. |
| **Originality.** Last round's losers were mostly scan apps and progress trackers, and "Same Light" already did lighting checks. | Our first ten seconds, on the landing page and in the video, show the **clinic's rebook queue and retained revenue**, not the scan. The scan is the input; the second visit is the product. |
| **Health data.** Screening asks about pregnancy and isotretinoin, which counts as consumer health data under Washington's My Health My Data Act, on top of biometric rules. | The consent screen names screening answers explicitly, and deletion removes them. The README's known limitations section says this is a demo, not HIPAA-ready (the Supabase free plan doesn't offer the agreement that would require). |
| **The YouCam "Agent Skills" package** is in a repo literally named `youcam-skills-test`. | I'll read its contents and use it as reference only. No blind install of third-party code. |

---

## Part 2 · Week 1 technical plan (October 6 to 12)

### Goal (from the brief)

A real phone completes consent → intake → capture → live analysis, and scores plus masks are stored. Fixture mode works with no API calls.

### Stack (versions checked on npm today)

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16.3 (App Router), React 19.3, TypeScript strict | Server Components by default. Client components only where the browser is needed (camera, intake steps). |
| Styling | Tailwind CSS 4.3 | Brand tokens defined once in `globals.css` via `@theme`, so `bg-porcelain`, `text-ink` and so on work everywhere. No component library. |
| Fonts | Cormorant Garamond 300 to 500, Inter 300 to 500 | Via `next/font/google`, self-hosted at build time, so no layout shift. |
| Database, auth, storage | Supabase (`@supabase/supabase-js` 2.117, `@supabase/ssr` 0.12) | SQL migrations in the repo. Row Level Security on every table. Private `scans` bucket. |
| Face detection | `@mediapipe/tasks-vision` 1.0 (Face Landmarker) | Model and WASM files self-hosted in `/public/mediapipe`, so we don't depend on Google's CDN. |
| Validation | Zod 4 | Env vars, API payloads, YouCam responses, and later the Claude report schema. |
| Skin analysis | YouCam API, server-side only | Behind a `SkinAnalysisProvider` interface with two implementations: `live` and `fixture`. |
| Tests | Vitest 5 for logic, Playwright 1.63 for flows | Playwright runs Chromium with a **fake camera fed by a face video**, so the capture gate is tested end to end without a phone. |
| Package manager | pnpm | |

Week 2+ (installed when needed): `@anthropic-ai/sdk` with model `claude-sonnet-5-5` and native structured outputs (JSON schema enforced by the API, then re-validated with Zod), `resend`, `stripe`, `recharts`.

### How a scan flows through the system

```
Phone (browser)                     Our server (Vercel)                 Outside services
─────────────────                   ───────────────────                 ────────────────
1. Quality gate passes, capture
   (portrait crop, JPEG, short
   side ≥ 1080 px)
2. POST /api/scans  ───────────────► create scan row (status: uploading)
                    ◄─────────────── signed upload URL
3. PUT photo ───────────────────────────────────────────────────────────► Supabase Storage (private)
4. POST /api/scans/:id/analyze ────► rate limit + unit budget check
                                     fixture mode: copy a fixture, done
                                     live mode: create file ─────────────► YouCam: file + pre-signed URL
                                                upload bytes ────────────► YouCam storage
                                                start task ──────────────► YouCam: task_id
                                     log units in api_usage
5. Every 2 to 5 s (backing off):
   GET /api/scans/:id/status ──────► one YouCam status check ────────────► YouCam
                                     on success: download scores + masks
                                     into our storage immediately
                                     (YouCam deletes them after 24 h),
                                     normalise, status: complete
                    ◄─────────────── status + friendly progress stage
6. Redirect to processing → (Week 2) report
```

Key properties:

- **No secrets in the browser.** Server-only modules are marked `server-only`, so a build fails if one is ever imported into client code. Env vars are validated at startup, and the app refuses to boot with a live Stripe key.
- **Idempotent and race-safe.** If two status polls arrive at once, a conditional database update ensures results are only processed once.
- **Honest progress.** The processing screen shows real stages from the server ("Reading texture", "Mapping tone"), never a fake percentage.
- **Friendly errors.** Each YouCam error code (`error_src_face_too_small`, `error_lighting_dark` and so on) maps to one calm retry instruction.
- **Budget protection.** Live scans are limited to 3 per IP per day (IPs stored hashed, never raw) plus a **global daily cap**. When either is hit, or remaining units drop below a reserve, the app switches that scan to fixture mode and labels the result "Demo analysis".
- **Mask alignment.** We store the exact image bytes sent to YouCam and its dimensions, so mask overlays line up perfectly in Week 2.

### The capture quality gate

All checks are pure functions in `src/lib/capture/`, unit-tested with recorded landmark data:

| Check | Method | Starting threshold |
|---|---|---|
| Exactly one face | Face Landmarker result count | 1 |
| Face size | Landmark bounding box ÷ frame width | ≥ 62% |
| Centred | Face centre offset from frame centre | within 8% |
| Frontal | Yaw and pitch from the facial transformation matrix | within ±10° |
| Light | Mean luminance of the face region, plus clipped-highlight share | in range; < 2% clipped |
| Even light | Left versus right cheek luminance | difference < 15% |
| Sharp | Variance of Laplacian on the face region (downscaled) | above a calibrated value |
| Eyes open | `eyeBlinkLeft` / `eyeBlinkRight` blendshapes | < 0.4 |
| **Rescan only:** same light as scan 01 | Face-region brightness and colour temperature versus the stored baseline | within a calibrated tolerance |

One instruction at a time, in priority order ("Move a little closer", "Face the light", "Hold still"). When everything passes, a one-second hold auto-captures. Every metric is saved with the scan. Uploaded photos go through the same checks on a still image before they're accepted.

### Day by day

| Day | Work | You'll be able to see |
|---|---|---|
| **Tue Oct 6** | Scaffold the app. Brand tokens, fonts, favicons generated from the monogram, base components (buttons, chips, labels, score bar, hairline sections, wordmark header). A private `/dev/components` page showing every component. `DECISIONS.md`, `PROGRESS.md`, `.env.example`, README skeleton, MIT licence. First Vercel deploy. | A live URL with the component gallery. Check fonts and colours on your phone. |
| **Wed Oct 7** | Database: first migration (all tables from brief section 5 plus the gaps in 1B.11), RLS policies, private storage bucket, virtual clock, seed script for the clinic, staff and menu. | Clinic and menu data in the Supabase dashboard. |
| **Thu Oct 8** | Client flow screens: `/c/maison-verre` start page, consent (stores a versioned consent record), intake one question per screen (progress saved server-side, so a refresh doesn't lose answers). | Walk through start → consent → intake on your phone. |
| **Fri Oct 9** | Capture: camera, face guide, the full quality gate, instruction copy, auto-capture, upload fallback, in-app browser detection. Playwright fake-camera test. Read the current YouCam docs end to end. | The gate working live on your phone (no analysis yet). |
| **Sat Oct 10** | YouCam integration: provider interface, live client, fixture provider, the start and status routes, mask download, normalisation, `api_usage` logging, error mapping, rate limit and global cap. Processing screen. Provisional fixtures built from the documented response shape until real ones exist. | Full flow in fixture mode with zero API calls. |
| **Sun Oct 11** | **First live scans with you, on your phone.** Run the noise-floor calibration (D3). Capture the first real fixtures from synthetic portraits (D1). | Real scores and masks stored in the database. |
| **Mon Oct 12** | Fix whatever the phone test found. Tests green. `PROGRESS.md` written. Week 2 starts from a clean base. | Week 1 "done when" met. |

**Critical path:** the YouCam key and units. If they aren't live by Saturday October 10, everything still gets built and tested in fixture mode, and live testing moves to the first day they are.

### YouCam unit budget (1,000 units, about 16 per full SD scan)

| Use | Scans | Units |
|---|---|---|
| Integration testing | 5 | ~80 |
| Noise-floor calibration (D3) | 6 | ~96 |
| Fixtures for seeded clients (about 8 distinct synthetic faces) | 8 | ~128 |
| Your real-phone testing, Weeks 1 to 4 | 10 | ~160 |
| Demo video takes | 4 | ~64 |
| **Left for judges** | **~29** | **~470** |

Failed tasks don't consume units. The dashboard (demo mode) shows units remaining. One cheaper option if we need it: requesting 12 concerns instead of 15 or 16 drops a scan to 14 units. I'd rather keep the full analysis and buy units if needed (D5).

### What you do in Week 1

- Before Tuesday: everything in Part 4 marked "Week 1".
- Thursday, Friday and Sunday: about 15 minutes each on your phone, following a test script I'll put in `PROGRESS.md`.
- Sunday: about 30 minutes for the live scan and calibration session (good window light, no makeup ideally).

---

## Part 3 · Folder structure

```
maison-verre/
├── BRIEF.md · PLAN.md · DECISIONS.md · PROGRESS.md · README.md · LICENSE
├── .env.example                 every variable, with a one-line explanation each
├── brand/                       original logo files (never edited)
├── reference/                   mockup PDF
├── fixtures/
│   └── youcam/<fixture-id>/     score JSON, mask PNGs, image, meta.json (synthetic faces only)
├── supabase/
│   ├── migrations/              numbered SQL files: tables, RLS, storage policies
│   └── seed/                    demo clinic, staff, menu (Week 3: 16 demo clients)
├── scripts/                     seed, apply-migrations, capture-fixture, make-favicons, check-copy
├── public/
│   ├── brand/                   web-optimised logo exports
│   └── mediapipe/               face_landmarker.task + WASM, self-hosted
├── src/
│   ├── app/
│   │   ├── page.tsx                         /   product landing (Week 4)
│   │   ├── c/[clinicSlug]/                  client flow
│   │   │   ├── page.tsx                     scan start
│   │   │   ├── consent/ intake/ capture/ processing/
│   │   ├── r/[token]/                       living report (Week 2), rescan/, book/
│   │   ├── dashboard/                       clinic side (Week 3)
│   │   ├── privacy/ terms/
│   │   ├── api/
│   │   │   ├── scans/route.ts               create scan + signed upload URL
│   │   │   ├── scans/[id]/analyze/route.ts  start analysis (live or fixture)
│   │   │   ├── scans/[id]/status/route.ts   one poll step, finalise on success
│   │   │   └── cron/                        keep-alive (Week 1), rebook engine (Week 3)
│   │   ├── dev/components/                  component gallery (hidden in production)
│   │   ├── layout.tsx · globals.css (brand tokens) · icon.png
│   ├── components/
│   │   ├── ui/                  Button, Chip, Label, ScoreBar, Hairline, Section, Wordmark, Field
│   │   ├── flow/                StepShell, StepProgress, consent and intake steps
│   │   └── capture/             CameraView, FaceGuide, GateInstruction, UploadFallback
│   ├── lib/
│   │   ├── env.ts               validated env vars, split into server and public
│   │   ├── clock.ts             virtual clock (demo time travel)
│   │   ├── supabase/            browser, server and admin clients
│   │   ├── youcam/              types, live client, fixture provider, errors, unit costs
│   │   ├── skin/                concern registry (API key → friendly name, menu tags), normalise
│   │   ├── capture/             gate checks: size, pose, luminance, sharpness, eyes, light match
│   │   ├── limits/              per-IP rate limit, global daily cap, unit reserve
│   │   ├── copy/                banned-word and em-dash checker
│   │   └── report/ email/ stripe/ engine/   (Weeks 2 and 3)
│   └── types/database.ts        generated from the Supabase schema
└── tests/
    ├── unit/                    gate maths, normalisation, unit costs, limits, copy checker
    └── e2e/                     Playwright with fake camera, fixture mode
```

Working rules: I build on a feature branch and Vercel gives every push its own preview URL. `main` is production. I'll write a short note in `PROGRESS.md` at each merge.

---

## Part 4 · Accounts and keys, step by step

### Ground rules for keys

- **Never paste a key into this chat.** Keys go in exactly two places: Vercel's settings (for the live app) and this Claude environment's settings (only the few I need to build). Step 7 explains both.
- Save every key in a password manager (1Password, Bitwarden or Apple Passwords) as you create it. Several services only show a key once.
- "Secret" keys are like the master password to that service. "Public" or "publishable" keys are designed to be visible in a browser and are fine.
- Screens get redesigned. If a button is named slightly differently from what I describe, look for the closest match. If you're stuck, tell me what you see.

### What you need, and when

| Key / value | From | Secret? | Goes into | Needed by |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase | No | Vercel + Claude env | Week 1 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase | No | Vercel + Claude env | Week 1 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | **Yes** | Vercel + Claude env | Week 1 |
| `SUPABASE_ACCESS_TOKEN` | Supabase account | **Yes** | Claude env only | Week 1 |
| `SUPABASE_PROJECT_REF` | Supabase | No | Claude env only | Week 1 |
| `YOUCAM_API_KEY` | YouCam | **Yes** | Vercel only | Week 1 |
| `YOUCAM_MODE` | You choose | No | Vercel | Week 1 |
| `APP_URL`, `DEMO_MODE` | You choose | No | Vercel | Week 1 |
| `CRON_SECRET`, `IP_HASH_SALT` | I'll generate | **Yes** | Vercel | Week 1 |
| `ANTHROPIC_API_KEY` | Anthropic | **Yes** | Vercel + Claude env | Week 2 |
| `RESEND_API_KEY`, `EMAIL_FROM` | Resend | **Yes** / No | Vercel | Week 2 |
| `STRIPE_SECRET_KEY` (sk_test_…) | Stripe | **Yes** | Vercel | Week 2 |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (pk_test_…) | Stripe | No | Vercel | Week 2 |
| `STRIPE_WEBHOOK_SECRET` (whsec_…) | Stripe | **Yes** | Vercel | Week 2, after first deploy |

`EMAIL_FROM`, `CRON_SECRET`, `IP_HASH_SALT`, `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF` are additions to the brief's list. I'll document them in `.env.example`.

The YouCam key deliberately stays out of my build environment. Every live call should come from the deployed app, where the rate limits and unit logging live, so nothing I do while building can quietly spend units.

---

### Step 1 · YouCam (Perfect Corp) · Week 1, do this first

1. Make sure you've registered for the hackathon on Devpost (the "Join hackathon" button on the hackathon page).
2. Follow the hackathon page's instructions for claiming the **1,000 free units**. Use the same email you'll use for the YouCam account.
3. Sign up for the YouCam API console (linked from the hackathon page and the docs at `yce.perfectcorp.com`).
4. In the console, check your unit balance shows 1,000.
5. Find the **API Key** section and create a new key. Name it `maison-verre`. Copy it into your password manager.
6. Note what the console shows: if you see a single **API key**, that's the current (v2) login method and all is well. If you see a **Client ID and Client Secret** instead, tell me. That's an older method and I'll adjust.
7. Don't put the key anywhere yet. It goes into Vercel in Step 6.

### Step 2 · Supabase (database, login, photo storage) · Week 1

1. Go to **supabase.com** → **Start your project** → sign in with your GitHub account (daboss23).
2. Click **New project**.
   - Organisation: your personal one, on the **Free** plan.
   - Name: `maison-verre`.
   - Database password: click **Generate a password**, then save it in your password manager.
   - Region: **East US (North Virginia)**. This puts the database next to Vercel's servers, which makes every page faster. Your clients being in California doesn't matter here.
3. Click **Create new project** and wait about two minutes.
4. Open **Project Settings** (gear icon) → **API Keys** (it may be called **Data API**). Copy three things:
   - **Project URL** (looks like `https://abcd1234.supabase.co`) → this is `NEXT_PUBLIC_SUPABASE_URL`. The `abcd1234` part is your **project ref** → `SUPABASE_PROJECT_REF`.
   - The **publishable** key (or **anon public** key, if that's what you see) → `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   - The **secret** key (or **service_role** key) → `SUPABASE_SERVICE_ROLE_KEY`. Treat this like a master password.
5. Click your avatar (top right) → **Account preferences** → **Access Tokens** → **Generate new token**. Name it `claude-migrations`. Copy it → `SUPABASE_ACCESS_TOKEN`. This lets me create tables from my workspace. It's powerful, so it goes in the Claude environment only, never in Vercel, and you can revoke it after the hackathon.
6. **Don't create any tables or storage buckets yourself.** My migration scripts do that, so the setup is repeatable and lives in the code.

### Step 3 · Anthropic (writes the reports) · Week 2, fine to do now

1. Go to **console.anthropic.com** and sign up.
2. **Settings → Billing**: add **$20** of credit. One report costs roughly 5 to 10 cents, so $20 covers development, testing and judging with room to spare.
3. **Settings → Limits**: set a monthly spend limit of **$50**, so a bug can never run up a bill.
4. **API Keys → Create Key**. Name it `maison-verre`. Copy it → `ANTHROPIC_API_KEY`.

### Step 4 · Resend (emails) · Week 2, but buy the domain now (D4)

1. **Buy a domain** if you agree with D4. The simplest route is **Vercel → Domains → Buy** (after Step 6), because Vercel then manages its settings for you. Pick something short and brand-safe, for example a `.app` or `.com` with "maisonverre" in it.
2. Go to **resend.com** and sign up.
3. **Domains → Add Domain**. Enter your domain (Resend suggests a subdomain like `mail.yourdomain.com`; accept that). Resend shows a handful of DNS records.
4. Add those records in Vercel: **Domains → your domain → DNS Records → Add**, copying each one exactly. Back in Resend, click **Verify**. It can take a few minutes to a few hours.
5. **API Keys → Create API Key**. Name it `maison-verre`, permission **Sending access**, restricted to your domain. Copy it → `RESEND_API_KEY`.
6. `EMAIL_FROM` will be something like `Maison Verre <hello@mail.yourdomain.com>`.

Without a domain, Resend only delivers to your own email address. The app still works because the report link is always shown on screen, but judges won't get emails.

### Step 5 · Stripe (test-mode deposits) · Week 2, fine to do now

1. Go to **stripe.com** and sign up. You do **not** need to activate the account or add bank details. Test mode works immediately.
2. Make sure you're in **test mode** (a "Test mode" toggle, or a **Sandbox**, at the top of the dashboard). Everything below must say "test".
3. **Developers → API keys**. Copy:
   - **Publishable key** (starts `pk_test_`) → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
   - **Secret key** (starts `sk_test_`; click "Reveal") → `STRIPE_SECRET_KEY`.
4. The webhook secret comes in Week 2, once the booking page is deployed. I'll walk you through it then (it's a 2-minute job: add an endpoint URL, tick a few events, copy the `whsec_` value).

The app will refuse to start if it ever sees a key starting `sk_live_`. No real money can move.

### Step 6 · Vercel (hosting) · Week 1

1. Go to **vercel.com** → **Sign Up** → **Hobby** plan → **Continue with GitHub**.
2. When GitHub asks which repositories Vercel can access, choose **Only select repositories** → `maison-verre`.
3. **Wait for my message on Tuesday** that the first version of the app is pushed. Then: **Add New → Project** → import `maison-verre` → leave every setting as detected (Next.js) → **Deploy**.
4. **Project → Settings → Environment Variables**. Add each variable from the table above. For each, tick **Production** and **Preview**, with these exceptions:
   - `YOUCAM_MODE`: `live` for **Production** only; `fixture` for **Preview**. That way only the main site can spend units.
   - `DEMO_MODE`: `true` for both.
   - `APP_URL`: your production address (e.g. `https://maison-verre.vercel.app`, or your domain later).
   - `CRON_SECRET` and `IP_HASH_SALT`: I'll give you a command to generate random values, or you can use your password manager's generator (40+ characters).
5. **Settings → Git**: confirm the production branch is `main`.
6. **Settings → Deployment Protection**: leave the default. Preview links will ask you to log in to Vercel, which is fine for you; judges only see production.
7. After adding or changing variables, go to **Deployments**, click the three dots on the latest one, and choose **Redeploy**. Variables only take effect on a new deploy.

### Step 7 · Let me reach the services from this workspace · Week 1

My cloud workspace currently blocks the services we need. In this session's title bar, open the **cloud environment menu → Edit**:

1. **Network access**: choose **Custom**, keep the default package-manager list, and add these allowed domains:
   - `*.supabase.co`
   - `api.supabase.com`
   - `docs.perfectcorp.com`
   - `docs.makeupar.com`
   - `yce.perfectcorp.com`
2. **Environment variables**: add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF`. In Week 2, add `ANTHROPIC_API_KEY` so I can test report prompts.
3. Start a new session afterwards. Settings are picked up by new sessions, not this one.

Instructions: https://code.claude.com/docs/en/cloud-environments#network-access

With this in place, I apply database migrations and seed data over HTTPS through Supabase's API. If that route is blocked for any reason, the fallback is a GitHub Action that runs migrations on every merge to `main`.

---

## Checklist · reply "keys are in" when these are done

**Decisions** (a one-line reply each is enough)
- [ ] D1 synthetic faces · D2 private judge scans · D3 calibration · D4 domain · D5 decide units on Oct 26 · D6 product versus clinic name
- [ ] Any objection to the fixes in 1B

**Accounts for Week 1**
- [ ] Devpost registration confirmed, YouCam units claimed, YouCam API key saved (Step 1)
- [ ] Supabase project created, 5 values saved (Step 2)
- [ ] Vercel account created and connected to GitHub (Step 6, items 1 and 2; the import happens Tuesday)
- [ ] Claude environment: domains allowed, Supabase variables added (Step 7)

**Fine to do now, needed in Week 2**
- [ ] Anthropic: $20 credit, $50 limit, key saved (Step 3)
- [ ] Domain bought, Resend domain verified, key saved (Step 4)
- [ ] Stripe test keys saved (Step 5)
