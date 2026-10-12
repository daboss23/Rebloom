# Rebloom

**The retention engine for skin clinics. Everyone sells the scan. Rebloom sells the result.**

Rebloom is our entry to Perfect Corp's YouCam API Skin AI & eCommerce VTO Hackathon (Skin AI track). Maison Verre (Santa Monica) and Tidewater Skin Studio (Charleston) are fictional demo clinics using it.

> Work in progress. This README grows each week; the full version (screenshots, architecture diagram, live demo and demo login) arrives in Week 4. See `PROGRESS.md` for what works today.

## The problem

Cosmetic skin clinics sell treatment as a series: peels, microneedling, IPL, laser. A client who comes once and disappears is barely profitable. Clinics know clients should come back. What they lack is proof to show the client why it's worth it, and a way to notice when someone is drifting away.

## How it works (the loop)

1. A clinic-branded scan page turns a website visitor into a booked consult with a personal skin report.
2. The practitioner gets a brief before the client walks in.
3. Progress scans between sessions measure real change, under verified capture conditions.
4. Measured improvement triggers the rebooking moment.
5. Stalled progress or missed scans flag the client as at risk.
6. The owner sees revenue retained, not just leads captured.

## How we use the YouCam API

Three YouCam features, all server-side, all on one photo upload per scan (`src/lib/youcam/client.ts`).

| Feature | Endpoint | Where it shows | Units |
|---|---|---|---|
| **AI Skin Analysis** (HD, SD fallback) | `POST /s2s/v2.1/task/skin-analysis` | The client's report and the practitioner brief: 15 scored concerns, skin type, skin age, detection masks | 16 to 22 |
| **AI Skin Simulation** | `POST /s2s/v2.0/task/skin-simulation` | "What to expect" on the report: today's photo beside an illustration of the plan | 4 to 6 |
| **AI Fitzpatrick Skin Type** | `POST /s2s/v2.0/task/fitzpatrick-scale-analyzer` | The practitioner brief only, and the plan's safety rule | 10 |

- **AI Skin Analysis (v2.1), 15 scored concerns plus skin type.** HD when the photo's short side is at least 1080 pixels (wrinkles and pores scored by area of the face), SD otherwise; YouCam refusing HD falls back to SD. Upload to a pre-signed URL, start the task, poll it from the browser one short request at a time. Concern names are mapped to client-friendly names and never shown raw.
- **Detection masks** are copied into our private storage on the poll that sees success (YouCam's mask links expire after about 2 hours), redrawn at the photo's exact size, and shown over the client's own photo as tappable overlays.
- **AI Skin Simulation** illustrates only the concerns the client's plan treats, at moderate strength, and less when fewer sessions are booked than a full course. Always labelled "An illustration of likely improvement based on your scan. Not a guaranteed result." Never run on demo readings.
- **AI Fitzpatrick Skin Type** (types I to VI) starts beside the analysis on a client's first live scan, on the same upload, and is read when the scan finalises. It is kept on the client and never repeated, since a person's type doesn't change. It's a safety prompt for the practitioner, never shown to the client: each treatment carries the highest type the clinic offers it to (the demo menu's IPL: types I to III), and the plan, the within-budget option and the agent's suggestions leave out anything that doesn't suit. The practitioner confirms the estimate or sets the type she sees in person, and her call is kept. She can also offer one client a treatment anyway (after a patch test, say), with her reason kept on record. It never holds up or fails a scan.
- **Then we delete each task at YouCam.** Once the scores, masks, image and type are ours, YouCam no longer holds the client's photo.
- **Units are logged** in `api_usage` for every live call, the dashboard shows what's left, and the public scan is rate-limited so the account can't be drained. YouCam only charges for tasks that succeed, and our log follows suit.
- **Every YouCam photo error has its own calm instruction** ("Face a window or a bright, even light"), and a network blip never fails a scan. If YouCam can't start a task at all, the scan finishes as a clearly labelled demo rather than a dead end.
- **A browser quality gate** (MediaPipe Face Landmarker) checks face size, centering, head pose, light, evenness, sharpness, eyes and mouth before a photo is taken, so YouCam receives photos that give reliable results. It is stricter than all three features' own photo rules.

### ui_score versus raw_score

YouCam's `ui_score` is adjusted upward as a motivator; `raw_score` is the underlying measurement.

- Clients see `ui_score`, as in Perfect Corp's own products.
- **Every progress claim, delta and rebooking trigger uses `raw_score`.** A change only earns a celebration when the raw change clears a threshold we calibrate by measuring how much scores move with lighting alone, and only when both scans were taken under matching light.
- Practitioners see both.

We measure progress on the raw data, not the flattering number.

## Run it locally (no keys needed)

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000. With no environment variables, Rebloom uses a local file store in `.data/` and **fixture mode**: realistic sample skin results with zero API calls, clearly labelled "Demo analysis". The camera needs `localhost` or HTTPS.

To use real services, copy `.env.example` to `.env.local` and fill in what you have. `YOUCAM_MODE=live` plus a `YOUCAM_API_KEY` switches to live analysis. To check the key without spending units, open `/setup/youcam` and enter the `CRON_SECRET`, or:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/youcam/check
```

## Checks

```bash
pnpm typecheck     # TypeScript
pnpm lint          # ESLint
pnpm test          # unit tests (gate maths, clock, fixtures, theming, copy rules, store, row mapping, YouCam parsing)
pnpm test:e2e      # browser tests of the client flow, in fixture mode with the local store
pnpm test:e2e:live # the same flow in live mode, against a local stand-in for YouCam's API (no units spent)
pnpm test:supabase # the Supabase store against the real project (needs keys; cleans up after itself)
pnpm check:copy    # no em dashes anywhere in the source
```

## Database

Schema lives in `supabase/migrations` (tables, row level security, the private `scans` photo bucket).

```bash
pnpm db:migrate    # apply new migrations through Supabase's Management API
pnpm db:seed       # upsert the demo clinics, staff, treatments and products from src/data
pnpm db:status     # what's applied, row counts, and whether the photo bucket is private
```

These need `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF`. Add `--print` to `db:migrate` or `db:seed` to print the SQL instead, for pasting into Supabase's SQL editor.

## Stack

Next.js 16 (App Router, TypeScript), Tailwind CSS 4, Supabase (Postgres, Auth, private Storage), YouCam API, MediaPipe Tasks Vision, Anthropic Claude (reads the client's own words, and an agent that drafts Dana's answers and second looks at stalled plans for her to send), Resend, Twilio (texts), Stripe (test mode only), Vercel.

## Privacy by design

Explicit biometric consent before the camera opens, a versioned consent record, private storage with token-scoped access, hashed IPs, one-tap data deletion, and private demo sandboxes, one per visitor, so no visitor ever sees another visitor's face.

## Project documents

- `BRIEF.md`: the product brief.
- `PLAN.md`: Week 1 plan and account setup.
- `DECISIONS.md`: every product and technical decision, with reasons.
- `PROGRESS.md`: what's done, what's next, and anything Joshua needs to do.

## Licence

MIT (added before submission).
