# Progress

## Session 1 · Monday October 5, 2026

### What's done

**The whole client flow runs with no keys at all.** On a laptop, `pnpm dev` gives you the complete scan experience using sample ("fixture") results.

- **Rebloom landing page** (`/`): the pitch, the loop, and a switcher between the two demo clinics.
- **Two white-label clinics:** Maison Verre (`/c/maison-verre`, champagne, serif) and Tidewater Skin Studio (`/c/tidewater`, sea glass, sans). Client pages show only the clinic's brand, with "Powered by Rebloom" in the footer.
- **Consent:** plain-English explanation, required biometric consent and optional reminders, stored with the wording version, the time and a hashed IP.
- **Intake:** seven short screens, one question each, saved as you go, so a refresh never loses answers. Includes the new free-text goal question and the optional age range.
- **Camera with the full quality gate:** face size, centering, head pose, light level, blown highlights, even light, sharpness, eyes open, mouth closed, holding still. One calm instruction at a time, auto-capture after a one-second hold, an "Upload a photo instead" path that runs the same checks, and a notice for in-app browsers (Instagram, Facebook) that block cameras.
- **Scan pipeline:** the photo is resized in the browser and uploaded straight to storage. Analysis is polled by the browser, with honest progress stages and no fake percentages. Fixture mode generates realistic scores and draws demo masks on the person's own face shape.
- **Report link on screen** right after every scan, with a copy button.
- **Interim report** (`/r/[token]`): the photo with tappable concern overlays, three priorities, full analysis, the cosmetic disclaimer, and a working **Delete my data**. Week 2 adds the AI-written report, the plan, prices and booking.
- **Privacy and Terms pages**, a hidden **component gallery** (`/dev/components`) for checking fonts and colors on your phone, and security headers.
- **Tests:** 33 unit tests and 6 browser tests, all passing. The production build passes.

### How to see it

Open the pull request's Vercel preview link on your phone, then:
1. Tap **Try the client experience**, then pick a clinic.
2. Go through consent and the questions.
3. Open the camera and follow the instructions. Try turning your head, dimming the light or moving away to see the guidance change.
4. After the photo, watch the processing screen, copy your link, and open your report.
5. Tap the concern buttons under your photo to see the overlays. At the bottom, try **Delete my data**.

Results say **Demo analysis**: they're sample scores until YouCam is connected. Until Supabase is connected, a banner says data may reset, because a preview server without a database keeps data only briefly. If a step says your session expired, start again from the clinic page.

## Session 1, part 2 · "Keys are in"

### What's done

**Supabase is live.** The database was set up on October 5 (Joshua ran the setup SQL in Supabase's SQL editor). Any deploy with the Supabase keys now stores everything there.

- **Schema** (`supabase/migrations`): clinics, treatments, products, sandboxes, clients, consents, intakes, scans, reports, unit usage and events. Row level security is on everywhere with no policies, so the public key reads nothing. There's a **private** `scans` bucket for photos and masks (JPEG and PNG only, 8 MB limit). Tested on a local Postgres 16.
- **Supabase store**: same interface as the local store, so no page changed. It covers race-safe scan finalisation, one report per client, intake steps that can't overwrite each other, unit totals summed in the database, and ids from cookies or URLs that can't crash a query.
- **Direct photo upload** to Supabase with one-time signed URLs. Before analysis, the server checks that the file really is a JPEG.
- **Daily keep-alive** (`/api/cron/keep-alive`, 09:17 UTC via `vercel.json`): keeps the free plan awake and deletes sandboxes older than 30 days, photos first.
- **Database commands**: `pnpm db:migrate`, `db:seed`, `db:status` (see README).
- **Tests**: 40 unit tests and 6 browser tests pass, and so does the production build. The browser tests always use the local store, so they never touch the real database. `pnpm test:supabase` runs 14 checks against the real project, including one that the public key sees no rows and no photos. It hasn't run yet: this workspace can't reach Supabase (see below).

### Fixed after the first deploy

- **Clinic pages errored on Vercel.** First cause: supabase-js needs Node 22, so the project now pins it. Second cause, from the Vercel log: "permission denied for table clinics". This project doesn't give new tables any Data API privileges by default, the server's role included. Migration `20261005130000_grants` grants them explicitly (DECISIONS D-038). Joshua runs it in the SQL editor.

### Blocked on network access

This workspace still can't reach Supabase or YouCam's docs. Network changes only apply to **new** sessions, so adding a host mid-session didn't unblock this one. So:
- The Supabase integration tests haven't run.
- The live YouCam client isn't written. The brief says to write it from the official docs, never from guesses.

### What's next

1. In a session that can reach Supabase, run `pnpm db:status` and `pnpm test:supabase`.
2. Live YouCam: read the official docs, write the live client, copy masks into our storage, log unit usage.
3. A live phone session together: first real scans, the lighting calibration (6 scans on 4 concerns), first real fixtures.

Then Week 2: the Claude-written report with guardrails, the plan and investment sections, booking with a test deposit, and emails to your own address.

### What Joshua needs to do

1. **Network access for this workspace:** allowed domains need `api.supabase.com`, `*.supabase.co`, `docs.perfectcorp.com`, `yce.perfectcorp.com` and `docs.makeupar.com`. Then start a new session from this branch.
   - Future migrations can also go through Supabase → **SQL Editor**: `pnpm db:migrate --print` gives the SQL.
2. **Vercel variables:** besides the Supabase ones, set `CRON_SECRET` (the keep-alive job won't run without it) and `IP_HASH_SALT`.
3. **Check the Vercel project** `skin-hackathon` is connected to `daboss23/maison-verre`, so this branch gets a preview link.
4. **Demo portraits (DECISIONS D-030):** five AI-generated, front-facing portraits for the demo clients (Amelia plus four others with varied ages and skin tones). Even light, neutral expression, mouth closed, no glasses, about 1080 × 1440. Image generation isn't available in my workspace.
5. **Review on your phone:** fonts, colors, spacing, and the camera guidance. Tell me anything that doesn't feel right.

### Known limitations right now

- Fixture scores are sample data and don't reflect the photo.
- The capture thresholds are starting values, to be tuned on real phones during the calibration session.
- No dashboard yet (Week 3). The landing page says "coming soon".
