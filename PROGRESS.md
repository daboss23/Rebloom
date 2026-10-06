# Progress

## Session 5 · Tuesday October 6, 2026 · The clinic dashboard

**The dashboard is live in demo mode at `/dashboard`.** "Enter demo as Dana" opens it. It answers one question each morning: who should we contact today, and why? Rebloom now has its own cool, glacial look; client pages stay Maison Verre (DECISIONS D-051).

### What's done
- **Today:** one line ("7 people to contact · 2 visits today · $2,450 ready to rebook"), the rebook queue with the reason for each person in one sentence, and today's visits. Every number is worked out from the data.
- **The rebook engine** (D-053): every trigger in the brief, one row per client, each priced from the menu. Email rows open a side sheet with the pre-written message to edit before sending; Chloe (no consent) gets a call; Grace (stalled) gets a plan review. Done items can be undone. In demo mode messages are logged in the outbox, never emailed.
- **Time travel** in the top bar: +1 day, +1 week, +1 month. Isabel's follow-up appears after two days; Sofia's session turns "missed" after two months.
- **Clients:** one table with status, last and next visit, and the lead concern with its trend line. Filters for leads, booked, in course, complete and at risk.
- **Practitioner brief** (D-055): face, lowest scores with trends, their words, facts, flags, Dana's note (now shown on the client's report), visits, and the plan with "Confirm plan with client".
- **Insights** (D-054): revenue kept through rebooking, rebook rate, reports that became bookings, clients at risk, and one monthly bar chart.
- **Settings** (D-056): the menu, a brand preview, and "Connects to".
- **Tests:** 318 unit tests (the engine checked on ten different days, both clinics, and with time travel), 14 browser tests (7 new for the dashboard), lint, typecheck, the copy check and the production build all pass.

### The landing page (D-059)
- **`/` now matches the dashboard** and opens on the product itself: the live rebook queue for the demo clinic, computed by the engine, beside "Everyone sells the scan. Rebloom sells the result."
- Then the problem in dollars from the demo menu, how the loop works (five steps, each drawn from the demo clients), the YouCam work and the raw-score decision, a calculator for a clinic's own figures, the two demo clinics to scan as a client, plain answers to the usual questions, and a close. Every CTA leads to the demo dashboard or the client scan.

### What's next
1. **Booking** with a Stripe test deposit, so a rebook message leads to a real booking.
2. **The progress view** on the client's report (scan 01 against the latest), which the progress-moment emails point to.
3. **Clinic login** by email (magic link) to replace the demo cookie (D-052).

### What Joshua needs to do
1. **Portraits** are still the biggest visual gap (D-030, list below in session 4). Until they arrive, the brief shows initials on ice mist.
2. **Optional, for the video:** `DEMO_TODAY` pins the date but keeps the time of day in UTC, so in the Los Angeles evening the clinic's date is the day before. Pin the day after the one you want, or record before 5pm Pacific.

---

## Session 4 · Tuesday October 6, 2026 · The clinic side's data, and twelve demo clients

The dashboard comes before booking (DECISIONS D-049): the rebook queue is what sets Rebloom apart, and it runs on demo data with no keys. This part is its foundation. Nothing new is visible yet; the dashboard screens come next.

### What's done
- **New tables** (migration `20261006120000_clinic_side`, already applied to the live project): staff, plans and their items, appointments, and the outbox of messages. Same rules as before: row level security on, no access for the public key, server only.
- **Safe by construction:** two bookings can't take overlapping times, a client can't end up with two live plans, and the rebook engine can't queue the same message twice. The database enforces all three, so they hold even when requests race.
- **Twelve demo clients** (`src/data/demo-clients.ts`), five starring and seven supporting. Every client status and every rebook trigger in the brief is on screen as soon as the dashboard opens. Each browser gets its own copy, dated around its own "today", in one all-or-nothing step.
- **Staff:** Dana and Claire at Maison Verre, seeded in the live project.
- **Time travel** can move a browser's clock forward, never back.
- **Tests:** 255 unit tests (the story checked against every day of the week and both daylight saving changes), 7 browser tests in demo mode and 7 in live mode, 18 checks against the real Supabase project (including two copies racing), and the production build all pass. The new database function was also tested on a local Postgres: racing copies, overlapping bookings, a deliberately broken copy and sandbox deletion.

### What's next
1. **Dashboard core:** "Enter demo as Dana", Today, the client list, and the practitioner brief with "Confirm plan" and a note that shows on the client's report.
2. **Rebook engine and queue,** with time travel. 3. **Insights and settings.** 4. **Booking** with a Stripe test deposit.

### What Joshua needs to do
1. **Portraits** (DECISIONS D-030). Five are needed; twelve make every practitioner brief look complete. AI-generated, front-facing, even soft light, neutral expression, mouth closed, no glasses or heavy makeup, plain background, portrait 1080 × 1440. Name each file by first name, as below. Upload them to the repo on GitHub (**Add file → Upload files**) into a new folder called `demo-portraits`.
   - Needed: `amelia.jpg` (34, fair skin with light freckles, auburn hair), `priya.jpg` (29, South Asian, medium brown skin, dark hair tied back), `marcus.jpg` (38, Black, deep brown skin, short hair, clean-shaven), `sofia.jpg` (45, Latina, medium olive skin, dark brown hair), `grace.jpg` (52, East Asian, light skin, black hair with some grey).
   - Nice to have: `hannah.jpg` (31, white, light skin, blonde), `olivia.jpg` (27, mixed heritage, light brown skin, curly hair), `daniel.jpg` (41, white, fair skin, clean-shaven), `nina.jpg` (58, Middle Eastern, light olive skin, grey-streaked hair), `chloe.jpg` (36, Black, medium brown skin, natural hair), `isabel.jpg` (24, Filipina, light-medium skin, long black hair), `rachel.jpg` (47, white, medium skin with sun freckles).
2. **Resend:** create an API key and add `RESEND_API_KEY` and `EMAIL_FROM` in Vercel (details in the chat). Nothing reads them until booking and the report email.

---

## Session 3, part 4 · Reports that answer the client

**HD and the simulation both worked on Joshua's first HD scan** (20:22): YouCam HD returned scores by area for wrinkles and pores, and the simulation was made for 4 units. But the report read the same in every section, because the priorities were simply the three lowest scores, and YouCam's lowest are almost always eyes and firmness. The client's own goal, "sun spots", wasn't mentioned at all.

Now (DECISIONS D-048):
- **Priorities:** the lowest score first, then what matters most once the client's goals are weighed in.
- **Their own words** are said back: "You told us about sun spots, and your scan shows room to improve here."
- **The plan treats what they came in for:** that scan now gets RF Skin Tightening plus the Signature Peel Series for the sun spots ($1,290), instead of RF alone.
- **Each line is specific:** where on the face it shows most (from HD), no repeated treatment sentences, and correct grammar.
- **Tests:** 103 unit tests (including this exact scan), 7 browser tests in demo mode and 7 in live mode, and the production build all pass.

---

## Session 3, part 3 · "What to expect": a simulation of the plan

**Live reports now show today's photo beside YouCam's simulation of the client's plan** (DECISIONS D-047). It's captioned "Week 11, illustrated" (the week of the planned progress scan) and always labelled "An illustration of likely improvement based on your scan. Not a guaranteed result."
- **Only what the plan treats** is simulated, at moderate strength, and less when fewer sessions are booked than a full course.
- **It's made once per scan,** the first time the unlocked report is opened, so it only costs units for clients who left their details: 4 to 6 units each. The image is kept privately and reused.
- **Demo-mode scans never get a simulation,** and if YouCam can't make one, the section is simply left out.
- **The scan and its scores are never changed.** The simulation is a separate image next to the photo.
- **Tests:** 97 unit tests, 15 against the real Supabase project (including the claim that stops two simulations starting at once), 7 browser tests in demo mode and 7 in live mode. The production build passes.
- **To confirm:** the request field names come from the overview page you pasted. The parameter reference page would confirm them. The first live report you open is the real test: look for "What to expect" under "Your path".

---

## Session 3, part 2 · YouCam HD skin analysis

**Camera scans now use YouCam's HD analysis** (DECISIONS D-046): a sharper model, with wrinkles and pores scored by facial area. When a wrinkle or pore priority has area scores, the report says where it shows most, e.g. "Most visible at the crow's feet". Live HD reports are labelled "HD analysis".
- **Camera photos (1080 × 1440) always qualify.** Uploaded photos smaller than 1080 pixels on the short side run SD, because stretching them wouldn't add detail. The first live scan was a 539 × 719 upload, so it would still run SD.
- **If YouCam ever refuses an HD request,** the scan reruns in SD, so it still gets a real reading.
- **A full HD scan costs 22 units** instead of 16. With 1,000 units, that's roughly 40 HD scans, after the 64 units kept back for your own demo.
- **Tests:** 91 unit tests, 7 browser tests in demo mode, and 6 browser tests in live mode, now including an HD scan. The production build passes.
- **Still to confirm:** YouCam's documentation is still blocked from this workspace, so the HD details come from Perfect Corp's own pages via web search. Your first HD scan on a phone is the real check. Look for "HD analysis" next to the date on the report.

---

## Session 3 · Monday October 5, 2026 · A plan and prices from each client's own results

### What's done

**The first live scan worked.** Samantha's scan at 15:11 UTC ran on YouCam for real: pores 73, dark circles 77, firmness 78, texture 99, and so on. The scores in the database are YouCam's. What still looked generic was everything around them: the same sentences for everyone, and nothing that used the client's answers.

**The report now builds a plan from each client's scan, answers and the clinic's menu** (DECISIONS D-045):
- **Priorities speak to the person.** Each one says whether they asked about it and which treatment in their plan works on it. The subhead names their own strongest areas.
- **"What you asked about"** answers concerns they raised that aren't priorities, honestly, even when the scan says it's a strength.
- **Your path:** dated sessions from the menu, on open days, a week or more apart, ending at their event if they gave one, with nothing inside a treatment's rest period before it.
- **Your investment:** each treatment × sessions at menu prices, and the total, all computed in code. If it goes over their budget, a "Closer to your budget" option that fits.
- **Between sessions:** up to two products from the clinic's shelf.
- **Ready when you are:** a suggested first visit, "Call to book" and "Text the clinic".

For Samantha's real scan: Microneedling × 3 for pores and firmness, Signature Facial × 3 for the dark circles she mentioned ($1,680), and inside her $500 to $1,000 budget, Microneedling × 1 and Signature Facial × 3 ($890).

**Tests:** 79 unit tests (15 new, including the real live scan), 7 browser tests, the copy check and the production build all pass.

### Still to come
- The Claude-written wording on top of this plan (needs `ANTHROPIC_API_KEY`), and real booking with availability and a deposit.

---

## Session 2 · Monday October 5, 2026 · YouCam connected

### What's done

**Live YouCam skin analysis is built, tested and ready to switch on.** With a key and `YOUCAM_MODE=live`, every scan now goes to YouCam for real:

- **The photo goes to YouCam** through the upload link YouCam provides, then a 16-action skin analysis starts (15 concerns plus skin type, 16 units).
- **Results come back into the report:** YouCam's real scores, and its detection masks copied into our private storage and drawn over the client's photo. Demo labels disappear for live scans.
- **YouCam then deletes the photo.** As soon as the scores and masks are ours, the task is deleted at YouCam.
- **Problems are handled calmly:** each photo problem YouCam reports (too dark, too far, head turned, no face) shows its own one-line instruction. A network blip never fails a scan. If YouCam can't start at all (wrong key, no units left), the scan still finishes, labelled "Demo analysis", instead of an error.
- **Units are counted honestly:** YouCam only charges for successful scans, and our ledger, in Supabase, now matches.
- **A setup page** at `/setup/youcam` tells you whether YouCam is connected and how many units are left, without spending any.
- **Bug fixed:** before Supabase was wired in, photo uploads were refused whenever the Supabase keys were set (DECISIONS D-043).
- **Merged in** the "Keys are in" work below (Supabase, the camera fixes, the new end of scan), so one pull request carries everything.

**Tests:** 64 unit tests, 7 browser tests in demo mode, 5 browser tests that run the whole flow in live mode against a local stand-in for YouCam, and 14 checks against the real Supabase project, all passing. The production build passes.

YouCam's documentation sites are still blocked from my workspace, so I built against real responses recorded from YouCam's live API by other hackathon teams, checked across three of them (DECISIONS D-041). The first real scan on your phone is the final confirmation.

### How to switch it on (about 5 minutes)

1. Merge the pull request, so the live site gets this code.
2. In **Vercel → skin-hackathon → Settings → Environment Variables**, check these are set, then **Redeploy**:
   - `YOUCAM_API_KEY`: your YouCam key. Tick **Production** (and **Preview** too if you want live scans on preview links).
   - `YOUCAM_MODE`: `live` for **Production**, `fixture` for **Preview**.
   - `CRON_SECRET`: a long random password (40+ characters) from your password manager. The daily keep-alive needs it too.
3. Open **https://skin-hackathon-topaz-rho.vercel.app/setup/youcam**, paste your `CRON_SECRET`, and tap **Check connection**. You want **Connected to YouCam.**, your unit balance, and **Live scans: On**.
   - "That password doesn't match": copy `CRON_SECRET` from Vercel again.
   - "YouCam rejected the API key": copy the key from the YouCam console into Vercel again, then redeploy.
4. Do one real scan on your phone. The report should show no "Demo analysis" label.

---

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

- **The camera looked stuck.** The feed stayed hidden until the 15 MB face guide had downloaded, and the download only started when the camera opened. It now downloads during the questions, and the feed shows as soon as the camera is on (D-039).

### Changes from Joshua's first full run

- **End of the scan** (DECISIONS D-040): turning gears and "Putting your report together." for 8 seconds, then a popup over a fully blurred report asking where to send the results ("Send my results"), then a thank-you confirmation. It never claims an email was sent until email is live.
- **Priorities that feel the same every time.** True, for two reasons. The scores are demo data until live YouCam is connected (four sample profiles, so repeats are common). The sentence under each priority is a stock line per concern. Personal wording comes from the Claude-written report (Week 2), which needs `ANTHROPIC_API_KEY`.

### Blocked on network access

This workspace still can't reach Supabase or YouCam's docs. Network changes only apply to **new** sessions, so adding a host mid-session didn't unblock this one. So:
- The Supabase integration tests haven't run.
- The live YouCam client isn't written. The brief says to write it from the official docs, never from guesses. (Written in Session 2 from responses recorded on YouCam's live API, since the docs are still blocked: DECISIONS D-041.)

### What's next

1. In a session that can reach Supabase, run `pnpm db:status` and `pnpm test:supabase`. (`test:supabase` ran in Session 2: 14 of 14 pass against the real project.)
2. ~~Live YouCam: write the live client, copy masks into our storage, log unit usage.~~ Done in Session 2.
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
