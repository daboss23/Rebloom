# Rebloom · Week 1 Plan

First written October 5, 2026 after reading `BRIEF.md`, the mockup in `/reference` and the logos in `/brand`. Updated the same day with Joshua's decisions.

**Rebloom** is the platform. **Maison Verre** (Santa Monica) is the hero demo clinic that uses it. A second, smaller demo clinic, **Tidewater Skin Studio** (Charleston), proves the white-label works. Pitch line: *Everyone sells the scan. Rebloom sells the second visit.*

This document has four parts:

1. **Decisions and risks:** what we settled, and what's still risky.
2. **Week 1 technical plan.**
3. **Folder structure.**
4. **Accounts and keys:** step-by-step setup for YouCam, Supabase, Anthropic, Resend, Stripe and Vercel, plus how to get keys to me safely.

Every decision, with its reasoning, is logged in `DECISIONS.md`. Progress is logged in `PROGRESS.md`.

---

## Part 1 · Decisions and risks

### 1A. Settled on October 5 (details in `DECISIONS.md`)

| Topic | Decision |
|---|---|
| Naming | Platform is **Rebloom** (text wordmark until a logo arrives). Client-facing scan and report pages show only the clinic's brand, with "Powered by Rebloom" in the footer. Landing page, dashboard, README and Devpost use Rebloom. |
| Lighting and progress | Measure the noise floor first: 6 calibration scans on 4 concerns (texture, age_spot, pore, redness) at 9 units each. Rescans **guide** the client toward scan 01's light but never block. Out-of-tolerance light still scans, the comparison is marked **lower confidence**, and a low-confidence comparison **never** fires a progress moment. |
| Privacy | Every browser gets a private **sandbox**. A judge's live scan, and the Dana dashboard they see, live in that sandbox. They appear as a new lead next to the demo clients; nobody else sees them. Sandboxes auto-delete after 30 days. |
| Demo clients | **5**, all with AI-generated portraits and full scans: a new lead who hasn't booked, a booked first consult, a mid-course client with a progress moment, a stalled at-risk client, and Amelia with her course complete. Historical monthly numbers are seeded so the Insights charts have shape. |
| Mockup fixes | All accepted. Amelia's final step is a gentle facial on **Tuesday January 5**. Budget band $1,000 to $2,000. "Fine lines" and "Evenness" replaced with real YouCam concerns. Intake gains an optional free-text goal question and an optional age range. |
| Email | No domain until Week 4. Email works to Joshua's own address for now. The report link is always shown on screen right after a scan, so nothing depends on email. |
| Second clinic | Small: name, colour, wordmark, city. Same menu. Switchable from the landing page. |
| Uploads | Photos are resized in the browser and uploaded straight to storage, never through our server. |
| Keep-alive | A daily scheduled job keeps Supabase from pausing during judging. |
| Units | Joshua will probably top up before judging, so limits exist as a safety valve, not a ration. |
| Time | A virtual clock from day one. |

### 1B. Brief and mockup fixes we're applying

1. Amelia's final peel on Monday January 4 becomes a Hydrating Infusion Facial on **Tuesday January 5** (the clinic is closed Mondays, and a peel 7 days before the wedding would break the two-week rule).
2. Amelia's budget shows **$1,000 to $2,000**, one of the real intake bands.
3. "Full analysis" shows exactly the concerns YouCam returned. No "Fine lines" or "Evenness".
4. Intake adds two optional questions: "In your own words, what would you like to change?" and an age range. The practitioner brief shows the quote and the age.
5. Client report says "Treatments $980" with home care listed separately; the practitioner brief says "Plan value incl. home care $1,090".
6. Clients see `ui_score` numbers. A concern only gets a celebration or a change badge when its **raw** change clears the calibrated threshold **and** the comparison is high-confidence. If ui and raw disagree in direction, the copy goes neutral.
7. Skin age is practitioner-only.
8. The copy checker uses phrase patterns plus an allowlist, so the required "not a medical diagnosis" footer and the word "treatment" don't trip it.
9. The data model adds clinic hours and booking slots, treatment downtime and minimum days before an event, interval ranges, ongoing courses, scan status, and sandbox ownership.

### 1C. Risks still open

| Risk | How we handle it |
|---|---|
| **YouCam API version and exact response shape.** The brief describes v2.0 with `mask_urls`; recent projects use v2.1, which returns a zip with `score_info.json` and mask images. I can't read the docs from my workspace until the network is opened. | The fixture provider and the normalised score format are designed so either version slots in behind the same interface. The live client gets written against the official docs once I can read them. |
| **Vercel limits** (4.5 MB uploads, function time limits) | Browser resize plus direct upload. Browser-driven polling, one quick check per request. |
| **Supabase pausing** | Daily keep-alive job, plus a reminder on November 1 to consider Pro ($25) for the judging month. |
| **Supabase's built-in email** only reaches your own team | Magic links send through Resend once the domain exists. "Enter demo as Dana" never needs email. |
| **Camera gate frustration** | Thresholds in one config file. Checks about 5 times a second. "Upload a photo instead" appears after 20 seconds. |
| **In-app browsers** (Instagram, Gmail) block cameras | Detected, with an "Open in Safari / Chrome" prompt and copy-link button. Upload still works. |
| **My workspace can't reach** YouCam, Supabase, Stripe, Resend, Vercel or YouCam's docs | You're opening the network now (Part 4, Step 7). Until then I build everything that runs with no keys. |
| **Originality** | Landing page and video lead with the clinic's rebook queue and retained revenue, not the scan. |
| **Health data** (pregnancy, isotretinoin) | Named explicitly in consent, removed on deletion, called out in README limitations (demo, not HIPAA-ready). |
| **Demo follow-up scans** | Scanning the same portrait twice returns identical scores, so later scans for demo clients use authored scores, clearly labelled as demo data. First scans are real API results. |

---

## Part 2 · Week 1 technical plan

### Goal

A real phone completes consent → intake → capture → live analysis, and scores plus masks are stored. Fixture mode works with no API calls. **New:** the whole client flow runs locally with no keys at all.

### Two modes, chosen automatically

| | No keys (local or preview) | Keys present (production) |
|---|---|---|
| Database | Local JSON file store in `.data/` | Supabase Postgres |
| Photo storage | Local files in `.data/uploads/` behind the same signed-URL flow | Supabase Storage, private bucket |
| Skin analysis | Fixture provider | Fixture or live YouCam, per `YOUCAM_MODE` |

Both stores sit behind one `Store` interface, so pages and API routes don't know which one they're talking to. The fixture provider produces realistic scores and **masks drawn from the client's own face landmarks** (captured by MediaPipe at capture time), so overlays line up on any face. Results are labelled "Demo analysis".

### Stack (versions checked on npm on October 5)

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16.3 (App Router), React 19.3, TypeScript strict | Server Components by default. |
| Styling | Tailwind CSS 4.3 | Brand tokens defined once in `globals.css` via `@theme`. No component library. |
| Fonts | Cormorant Garamond, Inter | `next/font/google`, self-hosted at build time. |
| Database, auth, storage | Supabase (`@supabase/supabase-js`, `@supabase/ssr`) | Wired in once keys are in. |
| Face detection | `@mediapipe/tasks-vision` 1.0 (Face Landmarker) | Model and WASM self-hosted in `/public/mediapipe`. |
| Validation | Zod 4 | Env, API payloads, YouCam responses, report schema. |
| Image processing (server) | sharp | Fixture masks, logo and favicon exports. |
| Tests | Vitest for logic, Playwright for flows | |
| Package manager | pnpm | |

Week 2+: `@anthropic-ai/sdk` with `claude-sonnet-5-5` and native structured outputs, `resend`, `stripe`, `recharts`.

### How a scan flows

```
Phone (browser)                     Our server (Vercel)                 Outside services
─────────────────                   ───────────────────                 ────────────────
1. Quality gate passes, capture
   (portrait crop, JPEG, resized
   in the browser, ~1080 px short side)
2. POST /api/scans  ───────────────► create scan row (status: uploading)
                    ◄─────────────── signed upload URL
3. PUT photo ───────────────────────────────────────────────────────────► Storage (private)
4. POST /api/scans/:id/analyze ────► limits check (safety valve, not a ration)
                                     fixture: generate results, done
                                     live: create file, upload, start task ► YouCam
                                     log units in api_usage
5. Every 2 to 5 s, backing off:
   GET /api/scans/:id/status ──────► one status check ───────────────────► YouCam
                                     on success: copy scores + masks into
                                     our storage at once (YouCam deletes
                                     after 24 h), normalise, complete
                    ◄─────────────── status + honest progress stage
6. Report link shown on screen, and emailed when email is configured
```

Properties: no secrets in the browser (`server-only` modules, validated env, refuses `sk_live_` keys); race-safe finalisation; honest progress stages; one calm retry instruction per YouCam error code; IPs stored hashed; masks stored with the exact image and dimensions sent.

### The capture quality gate

Pure functions in `src/lib/capture/`, unit-tested:

| Check | Method | Starting threshold |
|---|---|---|
| Exactly one face | Face Landmarker result count | 1 |
| Face size | Landmark box width ÷ frame width | ≥ 62% |
| Centred | Face centre offset | within 8% of frame |
| Frontal | Yaw and pitch from the transformation matrix | within ±10° |
| Light | Face-region mean luminance and clipped share | in range, < 2% clipped |
| Even light | Left versus right cheek luminance | difference < 15% |
| Sharp | Variance of Laplacian, face region | above a calibrated value |
| Eyes open | Blink blendshapes | < 0.4 |
| **Rescan:** same light as scan 01 | Face brightness and warmth versus the stored baseline | **Guides only, never blocks.** Outside tolerance → comparison marked lower confidence. |

One instruction at a time. One-second hold auto-captures. Every metric is saved with the scan. Uploaded photos go through the same checks on the still image.

### Order of work

**Now, no keys needed (this session):**
1. Scaffold, brand tokens, fonts, logo exports, favicons, base components, component gallery.
2. Virtual clock, sandbox cookie, `Store` interface with the local file store, seed data module (both clinics, menu, products).
3. Scan start page, consent (versioned consent record), intake (one question per screen, saved as you go).
4. Capture: camera, face guide, full quality gate, auto-capture, upload fallback, in-app browser detection, browser resize.
5. Scan pipeline: API routes, fixture provider with landmark-drawn masks, processing screen, an interim results page at `/r/[token]` with the link shown on screen.
6. Tests, `PROGRESS.md`, pull request.

**After "keys are in":**
7. Supabase migrations, RLS, private bucket, seed, keep-alive job.
8. Live YouCam client against the official docs, `api_usage` logging, limits.
9. Live scans with Joshua on his phone, noise-floor calibration, demo-client portraits scanned.

### YouCam unit budget (1,000 units)

| Use | Scans | Units |
|---|---|---|
| Integration testing | 5 × 16 | ~80 |
| Noise-floor calibration (4 concerns) | 6 × 9 | 54 |
| Demo clients' first scans | 5 × 16 | 80 |
| Joshua's phone testing, Weeks 1 to 4 | 10 × 16 | ~160 |
| Demo video takes | 4 × 16 | ~64 |
| **Left for judges before any top-up** | **~35** | **~560** |

Safety valves (all configurable): 5 live scans per browser per day, a generous global daily cap, and a reserve floor. Hitting any of them runs the scan in fixture mode, labelled "Demo analysis", so nobody hits a dead end.

---

## Part 3 · Folder structure

```
maison-verre/
├── BRIEF.md · PLAN.md · DECISIONS.md · PROGRESS.md · README.md · LICENSE
├── .env.example                 every variable, explained
├── brand/                       original logo files (never edited)
├── reference/                   mockup PDF
├── fixtures/                    saved YouCam responses (synthetic faces only)
├── supabase/migrations/         numbered SQL: tables, RLS, storage policies (after keys)
├── scripts/                     make-brand-assets, seed, capture-fixture, check-copy
├── public/
│   ├── brand/                   web-optimised logo exports
│   └── mediapipe/               face_landmarker.task + WASM, self-hosted
├── src/
│   ├── app/
│   │   ├── page.tsx                         /   Rebloom landing (Week 4; placeholder now)
│   │   ├── c/[clinicSlug]/                  client flow: start, consent, intake, capture, processing
│   │   ├── r/[token]/                       living report (interim now, full in Week 2)
│   │   ├── dashboard/                       clinic side (Week 3)
│   │   ├── privacy/ terms/
│   │   ├── api/scans/…                      create, analyze, status, upload (local mode), image
│   │   ├── api/cron/                        keep-alive, rebook engine
│   │   └── dev/components/                  component gallery (hidden in production)
│   ├── components/
│   │   ├── ui/                  Button, Chip, Label, ScoreBar, Hairline, Section, Field, wordmarks
│   │   ├── flow/                step shell, consent, intake
│   │   └── capture/             camera, face guide, instruction, upload fallback
│   ├── data/                    seed data: clinics, menu, products, demo clients
│   └── lib/
│       ├── env.ts · clock.ts · sandbox.ts · ids.ts
│       ├── store/               Store interface, local file store, Supabase store
│       ├── youcam/              types, unit costs, live client, fixture provider
│       ├── skin/                concern registry, normalise, fixture masks
│       ├── capture/             gate checks and thresholds
│       ├── limits/              per-browser limit, daily cap, reserve
│       ├── copy/                banned-word and em-dash checker
│       └── brand.ts             clinic theming (accent and its readable text colour)
└── tests/unit/ · tests/e2e/
```

Working rules: I build on `claude/lucid-fermat-nsxpry`; every push gets a preview on the `skin-hackathon` Vercel project. `main` is production. Each working chunk becomes a pull request with a plain-English summary.

---

## Part 4 · Accounts and keys, step by step

### Ground rules

- **Never paste a key into this chat.** Keys go in Vercel's settings (for the live app) and this Claude environment's settings (only what I need to build). Step 7 explains both.
- Save every key in a password manager as you create it. Several services only show a key once.
- "Secret" keys are master passwords. "Public" or "publishable" keys are meant to be visible in a browser.
- If a button is named slightly differently from what I describe, pick the closest match, or tell me what you see.

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
| `CRON_SECRET`, `IP_HASH_SALT` | Generated | **Yes** | Vercel | Week 1 |
| `ANTHROPIC_API_KEY` | Anthropic | **Yes** | Vercel + Claude env | Week 2 |
| `RESEND_API_KEY`, `EMAIL_FROM` | Resend | **Yes** / No | Vercel | Week 2 |
| `STRIPE_SECRET_KEY` (sk_test_…) | Stripe | **Yes** | Vercel | Week 2 |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (pk_test_…) | Stripe | No | Vercel | Week 2 |
| `STRIPE_WEBHOOK_SECRET` (whsec_…) | Stripe | **Yes** | Vercel | Week 2, after first deploy |
| `DEMO_TODAY` (optional) | You choose | No | Vercel | Week 4 (video) |

The YouCam key stays out of my build environment on purpose: every live call comes from the deployed app, where limits and unit logging live.

### Step 1 · YouCam (Perfect Corp) · Week 1, first

1. Confirm you're registered for the hackathon on Devpost.
2. Follow the hackathon page's instructions for claiming the **1,000 free units**, using the same email as your YouCam account.
3. Sign up for the YouCam API console (linked from the hackathon page; docs at `yce.perfectcorp.com`).
4. Check the console shows 1,000 units.
5. Create an **API key** named `maison-verre` and save it.
6. If the console shows a **Client ID and Client Secret** instead of a single key, tell me. That's the older login method.

### Step 2 · Supabase · Week 1

1. **supabase.com** → **Start your project** → sign in with GitHub (daboss23).
2. **New project**: your personal organisation on the **Free** plan; name `maison-verre`; **Generate a password** and save it; region **East US (North Virginia)** (next to Vercel's servers).
3. Wait about two minutes.
4. **Project Settings → API Keys** (or **Data API**). Save:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`. The `abcd1234` part of `https://abcd1234.supabase.co` → `SUPABASE_PROJECT_REF`.
   - **Publishable** (or **anon public**) key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   - **Secret** (or **service_role**) key → `SUPABASE_SERVICE_ROLE_KEY`.
5. Avatar → **Account preferences → Access Tokens → Generate new token**, named `claude-migrations` → `SUPABASE_ACCESS_TOKEN`. Claude environment only; revoke after the hackathon.
6. Don't create tables or buckets yourself. Migrations do that.

### Step 3 · Anthropic · Week 2, fine to do now

1. **console.anthropic.com** → sign up.
2. **Settings → Billing**: add **$20** (a report costs roughly 5 to 10 cents).
3. **Settings → Limits**: monthly limit **$50**.
4. **API Keys → Create Key** named `maison-verre` → `ANTHROPIC_API_KEY`.

### Step 4 · Resend · Week 2 (domain in Week 4)

1. **resend.com** → sign up **with the email address you want test emails to arrive at**. Until a domain is verified, Resend only delivers to that address.
2. **API Keys → Create API Key**, permission **Sending access** → `RESEND_API_KEY`.
3. Until the domain exists, `EMAIL_FROM` is `Rebloom <onboarding@resend.dev>`.
4. **Week 4:** buy the domain (Vercel → Domains), add it in Resend → **Domains**, copy the DNS records into Vercel, verify, then switch `EMAIL_FROM`.

### Step 5 · Stripe · Week 2, fine to do now

1. **stripe.com** → sign up. No activation or bank details needed for test mode.
2. Make sure you're in **test mode** (toggle or **Sandbox** at the top).
3. **Developers → API keys**: **Publishable key** (`pk_test_`) → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`; **Secret key** (`sk_test_`) → `STRIPE_SECRET_KEY`.
4. The webhook secret comes in Week 2. I'll walk you through it.

The app refuses to start with a key starting `sk_live_`.

### Step 6 · Vercel · Week 1

The `skin-hackathon` project (https://skin-hackathon-topaz-rho.vercel.app) already exists. Please check:

1. **Project → Settings → Git**: connected repository is **daboss23/maison-verre**, and the production branch is **main**. Every push to my branch then gets its own preview link automatically.
2. **Settings → Environment Variables**: add each Week 1 variable from the table. Tick **Production** and **Preview**, except:
   - `YOUCAM_MODE`: `live` for **Production** only, `fixture` for **Preview**.
   - `DEMO_MODE`: `true` for both.
   - `APP_URL`: `https://skin-hackathon-topaz-rho.vercel.app` (or the domain later).
   - `CRON_SECRET`, `IP_HASH_SALT`: generate with your password manager (40+ characters).
3. **Settings → Deployment Protection**: leave the default. Preview links ask you to log in to Vercel; judges only see production.
4. After changing variables: **Deployments** → three dots on the latest → **Redeploy**.

### Step 7 · Let me reach the services from this workspace · Week 1

In this session's title bar: **cloud environment menu → Edit**.

1. **Network access → Custom**. Keep the default package-manager list and add:
   `*.supabase.co`, `api.supabase.com`, `docs.perfectcorp.com`, `docs.makeupar.com`, `yce.perfectcorp.com`, `*.vercel.app`
2. **Environment variables**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`. In Week 2, add `ANTHROPIC_API_KEY`.
3. New sessions pick these up.

Instructions: https://code.claude.com/docs/en/cloud-environments#network-access

I apply migrations over HTTPS through Supabase's API. Fallback: a GitHub Action that runs migrations on every merge to `main`.

---

## Checklist · reply "keys are in" when done

- [ ] YouCam: registered, units claimed, API key saved (Step 1)
- [ ] Supabase: project created, 5 values saved (Step 2)
- [ ] Vercel: Git connection and variables checked (Step 6)
- [ ] Claude environment: domains allowed, Supabase variables added (Step 7)
- [ ] Fine to do now, needed in Week 2: Anthropic (Step 3), Resend (Step 4), Stripe (Step 5)
