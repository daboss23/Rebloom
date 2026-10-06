# Decisions

A running log of product and technical decisions: what we chose, why, and what it affects. Newest entries go at the bottom of each section. "J" means Joshua decided; "C" means Claude decided under the brief's "make a sensible decision and note it" rule. Anything marked C can be overturned cheaply unless it says otherwise.

---

## Product and brand

### D-001 · The platform is Rebloom (J, Oct 5)
Rebloom is the product. Maison Verre is a demo clinic that uses it. Rebloom appears on the landing page, dashboard, README and Devpost. Client-facing scan and report pages carry only the clinic's brand, with a small "Powered by Rebloom" in the footer. Pitch line: "Everyone sells the scan. Rebloom sells the second visit." Rebloom uses a text wordmark until Joshua supplies a logo.

### D-002 · Second demo clinic: Tidewater Skin Studio, Charleston (J + C, Oct 5)
J asked for a small second clinic (name, colour, wordmark, city; same menu; switchable from the landing page) that clearly contrasts with Maison Verre. C chose:
- **Name:** Tidewater Skin Studio · Charleston, South Carolina
- **Accent:** sea glass `#8FB8AE`, a cool green against Maison Verre's warm champagne (ink text on it: 7.9:1 contrast)
- **Wordmark:** Inter, uppercase, wide tracking, against Maison Verre's Cormorant serif
- **Slug:** `/c/tidewater`

Every clinic's accent gets an automatically chosen readable text colour, so a future clinic can't pick an accent that breaks contrast.

### D-003 · Five demo clients (J, Oct 5)
Five clients with AI-generated portraits and full scans, one per stage: new lead (no booking), booked first consult, mid-course with a progress moment, stalled and at risk, and Amelia (course complete). Historical monthly numbers are seeded separately so the Insights charts have shape.

### D-004 · Demo follow-up scans use authored scores (C, Oct 5)
The YouCam scanner is deterministic: the same image returns the same scores. So each demo client's **first** scan is a real API result on their portrait, and later scans (Amelia's 02 to 04, for example) use authored scores consistent with the story. These are labelled as demo data in the dashboard. Every number a live user sees about their own face is real or clearly labelled "Demo analysis".

### D-005 · Mockup fixes (J, Oct 5)
- Amelia's final step: Hydrating Infusion Facial on **Tuesday January 5** (the clinic is closed Mondays; a peel 7 days before the wedding breaks the two-week rule).
- Amelia's budget band: **$1,000 to $2,000**.
- "Full analysis" lists only concerns YouCam returns. "Fine lines" and "Evenness" are gone.
- Intake adds two optional questions: free text ("In your own words, what would you like to change?") and an age range.
- Client report: "Treatments $980" with home care listed separately. Practitioner brief: "Plan value incl. home care $1,090".

### D-006 · "In her words" label (C, Oct 5)
We keep the quote section. Because intake doesn't ask for pronouns, the label renders with the client's first name: "In Amelia's words". This is a one-line change if Joshua prefers a different label.

### D-007 · Skin age is practitioner-only (C, Oct 5)
Showing a client that their skin "looks older" than they are contradicts the voice rules. It appears in the practitioner brief only.

### D-008 · Email without a domain until Week 4 (J, Oct 5)
Emails go via Resend's shared sender to Joshua's own address until a domain is verified. The report link is always shown on screen straight after every scan, so the client journey never depends on email.

---

## Measurement and honesty

### D-009 · Display ui_score, measure with raw_score (brief §6.4)
Clients see `ui_score`. All progress maths, deltas and triggers use `raw_score`. The practitioner brief shows both.

### D-010 · Change badges need raw evidence (C, Oct 5)
On the progress view, the numbers shown are ui scores and the arithmetic matches what's on screen. But a concern only earns a celebration or a "+13" badge when its **raw** change clears the calibrated threshold **and** the comparison is high-confidence (D-011). If ui and raw move in opposite directions, the copy goes neutral ("holding steady").

### D-011 · Lighting calibration and lower-confidence comparisons (J, Oct 5)
- Before setting thresholds, run 6 calibration scans on 4 concerns only (`texture`, `age_spot`, `pore`, `redness`; 9 units each) to measure how much scores move with light.
- Rescans **guide** the client toward scan 01's light (brightness and warmth of the face region) but **never block** them.
- If light is outside tolerance, the scan runs and the comparison is stored as `lower_confidence`.
- A lower-confidence comparison **never** fires a progress moment.
- Thresholds (`PROGRESS_MOMENT_RAW_DELTA`, `STALLED_RAW_DELTA`, light tolerances) are constants, provisional until calibration.

### D-012 · Copy checker uses patterns plus an allowlist (C, Oct 5)
Banned words are matched as phrases with word boundaries ("treat acne" fails; "treatment" passes). Fixed legal text, such as "not a medical diagnosis" in the required footer, is allowlisted. Em dashes are always rejected.

---

## Privacy and demo isolation

### D-013 · Per-browser sandboxes (J, Oct 5)
Every browser gets a random, httpOnly sandbox cookie. Live scans belong to that sandbox. The Dana dashboard a visitor sees shows the demo clients **plus** their own scans as new leads. Nobody else sees them. Sandbox data (photos, personal data, scans) auto-deletes after 30 days.

### D-014 · Each sandbox gets its own copy of the demo clients (C, Oct 5)
If all visitors shared one set of demo clients, one judge clicking "Send rebook message" or "Confirm plan" would change what the next judge sees. So when a sandbox first opens the dashboard, it receives its own copy of the five demo clients (database rows only; portraits and masks are shared read-only files). Their dates are laid out relative to that sandbox's "today", so the demo always looks current, however late in judging someone visits. Time travel is per sandbox too.

### D-015 · IP addresses are hashed (C, Oct 5)
Rate limiting uses a salted hash of the IP (`IP_HASH_SALT`), never the raw address. Consent records keep the user agent and the hashed IP as evidence of consent.

---

## Time

### D-016 · Virtual clock from day one (J + C, Oct 5)
Every date in the app comes from `clock.now()`, never `new Date()` directly. The clock is:
- real time by default;
- optionally pinned by `DEMO_TODAY` (for example `2026-12-29`, so the video matches the mockup's dates exactly);
- plus a per-sandbox offset in days, which the Week 3 time-travel control moves forward.

Real time is still used for security (token expiry, rate limits, the 30-day auto-delete).

---

## Architecture

### D-017 · Runs with no keys at all (J + C, Oct 5)
When Supabase keys are missing, the app uses a local JSON file store (`.data/`) and local file storage behind the same signed-upload flow. When `YOUCAM_MODE` isn't `live`, or no YouCam key is set, it uses the fixture provider. Pages and API routes talk to one `Store` interface and one `SkinAnalysisProvider` interface and never know which implementation is underneath. On a Vercel preview without database keys, the local store lives in temporary server memory and can reset; a banner says so.

### D-018 · Browser resize, direct upload (J, Oct 5)
The browser crops to portrait, resizes so the short side is about 1080 px (above YouCam's SD minimum of 480 px, and enough for HD later) and uploads the JPEG straight to storage with a one-time signed URL. Photos never pass through our server functions, so Vercel's 4.5 MB body limit never applies.

### D-019 · Browser-driven polling (C, Oct 5)
The browser polls `/api/scans/:id/status` every 2 to 5 seconds, backing off. Each request makes at most one YouCam status check, so no server function waits minutes. Finalisation uses a conditional status update so it runs exactly once, even if two polls race.

### D-020 · Fixture masks are drawn from the client's own landmarks (C, Oct 5)
In fixture mode we have no real YouCam masks for a new face. Instead, the 478 face landmarks MediaPipe finds at capture are saved with the scan, and the fixture provider draws plausible per-concern masks inside real facial regions (cheeks, forehead, nose, under-eye). They line up on any face. Results are labelled "Demo analysis".

### D-021 · Provisional YouCam shapes (C, Oct 5)
YouCam's docs are unreachable from the build workspace until the network allowlist is updated. Until then, raw fixture responses follow the brief's description (per-concern `ui_score`, `raw_score`, masks; overall `all` score and `skin_age`). Everything downstream uses our own normalised format, so swapping in the confirmed v2.0 or v2.1 shape touches one file.

### D-022 · Unit limits are a safety valve (J, Oct 5)
Joshua will probably top up units before judging. Limits are: 5 live scans per browser per day, a generous global daily cap and a reserve floor, all configurable. Hitting any limit runs that scan in fixture mode with a "Demo analysis" label instead of showing an error.

### D-023 · Keep-alive (J, Oct 5)
A daily Vercel cron job runs a trivial database query so the Supabase free plan never pauses during judging. The same job clears expired sandboxes (D-013).

### D-024 · MediaPipe assets are self-hosted (C, Oct 5)
The Face Landmarker model (`face_landmarker.task`, Apache 2.0) and its WASM files are served from `/public/mediapipe`. That avoids a runtime dependency on Google's CDN and keeps capture working when that CDN is slow or blocked.

### D-025 · Fonts via next/font/google (brief §7.4)
Cormorant Garamond (300, 400, 500) and Inter (300, 400, 500) load through `next/font/google`, which downloads them at build time and serves them from our own domain.

---

## Build notes (October 5)

### D-026 · Sharpness threshold rescaled (C, Oct 5)
The first sharpness threshold (12) was on the wrong scale. A sharp test photo measures about 1,470 on our variance-of-Laplacian measure, so the starting threshold is now 120. Still provisional until real phones are tested.

### D-027 · Demo masks are porcelain with a hairline ink edge (C, Oct 5)
Bronze marks almost disappeared on deeper skin tones. Masks now render as light porcelain marks with a thin dark edge, which read on every skin tone, and mark sizes scale with the face rather than the photo.

### D-028 · Selfies are stored mirrored (C, Oct 5)
Camera photos are saved the way the person saw themselves in the preview (mirrored), so the face map matches the mirror they know. Uploaded photos are kept as they are. Skin analysis isn't affected by mirroring.

### D-029 · Delete my data built in Week 1 (C, Oct 5)
The consent screen promises a delete link, so it ships with the first version of the report rather than in Week 2. Deletion removes photos, masks, scores, answers, consent records and contact details, and keeps one anonymous "client deleted" event for counts.

### D-030 · Demo portraits still needed (open, Oct 5)
No image-generation tool is available in the build workspace, so the five AI-generated demo portraits (D-003) aren't made yet. Joshua generates them with a tool of his choice (front-facing, even light, no glasses, neutral expression, mouth closed, about 1080 × 1440), or we revisit together.

## D-031 · Report gate: contact details after the scan, not during intake
Brief 3.1 step 6. Name, email, phone and the reminders opt-in moved from intake and consent to a gate shown when analysis finishes. The client sees their report blurred behind the form. Security: the status API returns no report link until the client has an email, `/r/[token]` and its photo and mask routes 404 for clients without one, and the blurred layer uses a server-blurred photo (`/api/scans/[id]/preview`) plus placeholder score bars, never real scores. A completed scan with no contact details stays `started` (an abandoned scan); the client becomes a `lead` at the gate. The panel overlays the report at every width, since the client pages are a single 560px column.

## D-032 · Supabase: server-only access, RLS on with no policies (C, Oct 5)
The app reaches Supabase only from the server, with the secret key. Every table has row level security on and no policies, so the public key reads nothing, and the private `scans` bucket has no storage policies. Browsers upload through one-time signed URLs and see photos only through our own routes, after the report token is checked. Staff policies arrive with dashboard login in Week 3. An integration test checks that the public key gets no rows and no photos.

## D-033 · Migrations run through Supabase's Management API (C, Oct 5)
`pnpm db:migrate` sends each file in `supabase/migrations` over HTTPS in one transaction and records it in `supabase_migrations.schema_migrations`, the table the Supabase CLI uses, so the CLI can take over later. No database password or direct connection is needed. `--print` gives the same SQL for the SQL editor when the API isn't reachable.

## D-034 · Unit totals are summed in the database (C, Oct 5)
Supabase's Data API returns at most 1,000 rows per request, so adding up `api_usage` in the app would quietly undercount all-time spend once usage grows, and the reserve check would let units through. A small SQL function, `usage_totals`, does the sum. Only the server can call it.

## D-035 · Usage rows outlive deleted clients and sandboxes (C, Oct 5)
`api_usage` has no foreign keys. Deleting a client or an expired sandbox removes their photos and personal data but keeps the anonymous unit spend, so the budget stays right.

## D-036 · The browser tests always use the local store (C, Oct 5)
`REBLOOM_STORE=local` forces the file store even when Supabase keys are present. Playwright sets it, so browser tests never write to the real project. `pnpm test:supabase` is the separate, opt-in check against the real database.

## D-037 · Node 22 everywhere; config values are trimmed (C, Oct 5)
supabase-js sets up its realtime client as soon as it starts, and that needs the WebSocket class built into Node 22. On Node 20 every database call throws "native WebSocket not found", so `package.json` pins `engines.node` to `22.x`, which Vercel uses over the project setting. Separately, values pasted into a dashboard often carry a stray space or line break, so every variable is trimmed before checking, and choices like `YOUCAM_MODE` ignore case. Values that are actually wrong, such as a live Stripe key, still stop the app.

## D-038 · Table privileges are granted in a migration, not left to project settings (C, Oct 5)
The first deploy against Supabase failed with "permission denied for table clinics". This project doesn't expose new tables to the Data API automatically, so tables made in SQL had no privileges even for `service_role`, the server's role. (Row level security is a separate layer: `service_role` skips it but still needs privileges.) Migration `20261005130000_grants` now grants the server read and write on every table, revokes everything from `anon` and `authenticated`, and sets the same for future tables. The app no longer depends on how the project was set up, and the public key is refused outright instead of just seeing no rows. A startup check also refuses Supabase's public key in the secret-key variable, which would fail the same way.

## D-039 · The face guide downloads during the questions; the camera shows at once (C, Oct 5)
The face guide (MediaPipe engine and face model) is about 15 MB. It used to start downloading only after "Open the camera", and the camera feed stayed hidden behind "Preparing the camera" until it was ready, so on a phone connection the camera looked stuck. Now the files download in the background during the intake questions (network only, no processing), the guide starts setting up on the camera intro screen, and the feed appears as soon as the camera is on, with "Loading the face guide" until the checks begin. A browser test checks the download starts during the questions.

## D-040 · The end of the scan: gears, a popup over the blurred report, "Send my results" (J + C, Oct 5)
Joshua's changes after his first full run, refining D-031:
- **Putting the report together.** After the analysis, the screen shows turning gears and "Putting your report together." for 8 seconds while it works through what the report contains. Every report still behind the gate gets this, however fast the analysis was. From Week 2 the Claude-written report is generated during this time, so 8 seconds becomes a minimum, not a pause.
- **The blurred report** now has the full shape of a report: headline, text, an overall score, three priorities with numbers and bars, and the full analysis grid. The words and numbers are placeholders, never the client's real results (D-031 still holds).
- **The gate is a popup** (a sheet from the bottom on phones) that arrives over the blurred report after a short beat, with the page behind it locked. The button says **Send my results**.
- **After opting in, the client sees a confirmation, not the report.** It thanks them for completing their skin consultation with the clinic. The copy only says the results were sent once the report email is actually live (`REPORT_EMAIL_LIVE`, Week 2). Until then it says the report is ready, shows a small demo note that nothing was emailed, and offers **Open my report**. Once email is live, that becomes a quiet "open your report here" fallback under "check your spam folder", which keeps D-008: the report never depends on email reaching an inbox (Resend only reaches Joshua's address until the domain is verified in Week 4).

## D-041 · YouCam's wire format, confirmed (C, Oct 5). Supersedes D-021
Perfect Corp's documentation hosts are still blocked from the build workspace, so the live client is written against live-recorded v2.1 responses published by other hackathon entrants, cross-checked across three independent implementations. The flow:
1. `POST /s2s/v2.0/file` with `{ files: [{ content_type, file_name, file_size }] }` returns `data.files[0].file_id` and a pre-signed `PUT` with exact headers. The upload sends those headers and no API key.
2. `POST /s2s/v2.1/task/skin-analysis` with `src_file_id`, 16 SD `dst_actions` (15 concerns plus `skin_type`), `miniserver_args: { enable_mask_overlay: false }` and `format: "json"` (the default is a zip) returns `data.task_id`.
3. `GET /s2s/v2.1/task/skin-analysis/{task_id}` returns `task_status` (`running`, `success`, `error`). On success, `results.output` is a list keyed by `type`; on error, `error` holds the code.
4. `POST /s2s/v2.0/task/delete` with `{ task_id }` removes the photo and results at YouCam.

Where reality differs from the brief's description:
- The overall `all` score is **one number on the ui scale**, with no raw counterpart. Our raw overall is the mean of the concern raw scores, so it only moves when the measurements do.
- `raw_score` is a float. We keep one decimal (thresholds are a few points wide); ui scores stay whole.
- `skin_type` arrives as three zones (whole, T-zone, U-zone). Clients see none of it; the zones are kept for the practitioner brief.
- **Mask links expire after about 2 hours** (results are kept 24), so masks are copied on the poll that sees success.
- Masks are PNGs with alpha at the uploaded photo's size. We redraw each as white-on-transparent at the stored photo's exact size (from alpha, or from brightness if a mask is opaque), so the report tints live and demo masks the same way.
- Units are charged only when a task succeeds.

The first real scan is the final confirmation. If anything differs, `src/lib/youcam/parse.ts` is the one file to change, and its tests use the recorded shape in `tests/fixtures/youcam/`.

## D-042 · How live analysis fails, and what it costs (C, Oct 5)
- **YouCam won't start a task** (wrong key, out of units, unreachable): the scan runs as a clearly labelled demo instead of a dead end (extends D-022). The reason is kept on the scan (`errorCode` such as `live_start_credits`) and in the server log.
- **Blips while polling** (rate limit, 5xx, network) never fail a scan; the next poll asks again. A live analysis still unfinished after 3 minutes is abandoned with a calm retry message, and a finalisation cut off mid-way is recovered rather than spinning forever.
- **Photo errors** from YouCam (too dark, face too small, head turned, no face, and others) each get one plain instruction and a "Take a new photo" button.
- **A mask that won't copy** costs that concern its overlay, never the scan.
- **Units** are logged when a task starts, so limits count every attempt, and released when YouCam reports the task failed. A timed-out task keeps its units counted, since it may still finish.
- **Privacy:** the task is deleted at YouCam as soon as scores and masks are in our storage, and after a failure. Signed mask links are never stored.

## D-043 · The photo upload route follows the store in use (C, Oct 5)
Bug fix. The local upload route decided from the Supabase keys whether to open, while the store was chosen separately. Before Supabase was wired in, any deploy with those keys set refused every photo upload (404), so no scan could finish. The route now asks which store is actually in use, so the two can't disagree again, whatever chooses the store (the keys, or `REBLOOM_STORE=local` in tests).

## D-044 · A zero-unit YouCam connection check (C, Oct 5)
`GET /api/youcam/check` with `Authorization: Bearer <CRON_SECRET>` reads the YouCam account balance, which costs nothing, and reports whether the key works, the mode, and our own unit ledger. It answers 404 to anyone without the secret. The setup page `/setup/youcam` puts a password box and a button in front of it, so nobody needs a terminal; the password travels in the request header, never the URL, and isn't stored.

## D-045 · A rules-based plan, priced in code, ahead of the Claude-written report (C, Oct 5)
Joshua's first live scan worked, but the report still read as generic: the scores were real, the words around them were the same for everyone, and nothing used the client's answers. So the plan, investment and home care sections from brief 3.3 are built now, rules-based, in `src/lib/plan/build.ts`. This is the brief 8.3 fallback brought forward: it needs no API key, and when the Claude-written report arrives it writes the wording, never different numbers.
- **What the plan works on:** the three lowest scores, plus the concern the client asked about that needs it most. Asking about a concern (ticked, or named in their own words, e.g. "dark circles") adds 12 points of need.
- **Treatments:** only from the clinic's active menu. The first must work on the lowest score, since the report says that's where we'd begin. A second joins only if it covers enough more. At most two.
- **Budget:** if the full plan goes over the client's band, a "Closer to your budget" option sits beside it: the best mix of up to two treatments, with fewer sessions if need be, that fits.
- **Dates:** counted from the scan date, so the plan doesn't move each time the link opens. Clinic open days only, visits at least a week apart, nothing inside a treatment's rest period before an event (sessions are cut, and repriced, to fit). A progress scan follows two weeks after the last session.
- **Prices:** every line and total computed from menu prices in code.
- **Home care:** up to two products for the plan's concerns, with sun protection first whenever the plan includes light or resurfacing.
- **Wording:** each priority says whether the client asked about it and which treatment in the plan works on it. What they asked about that isn't a priority gets a plain answer ("You mentioned uneven tone. Radiance and pigmentation are among your stronger areas on this scan").
- **Booking:** the button calls the clinic, and "Questions? Text the clinic" opens a text. The first visit is labelled "suggested", since real availability arrives with booking in Week 2.
The plan isn't stored yet. It's recomputed from the scan, intake and menu, which keeps it consistent until a practitioner confirms one (Week 3, `plans` table).

## D-046 · YouCam HD skin analysis for camera photos (J + C, Oct 5)
Joshua asked for YouCam's HD skin analysis. HD is the same endpoint (`/s2s/v2.1/task/skin-analysis`) with HD action names, a model trained on twice the resolution, and wrinkles and pores scored by facial area.
- **When HD runs:** whenever the photo has at least 1080 pixels on its short side, YouCam's HD minimum. The camera already saves 1080 × 1440, so every camera scan qualifies. Smaller uploads run SD, never upscaled: stretching a small photo would pass HD's size check without adding any detail. (The first live scan, October 5, was a 539 × 719 upload.) `YOUCAM_ENGINE=sd` turns HD off.
- **Action names:** `hd_` plus the SD name, except dark circles (`dark_circle_v2` in SD, `hd_dark_circle` in HD), plus `hd_skin_type`. SD and HD can't be mixed in one task.
- **If YouCam refuses the HD request** (InvalidParameters), the same upload is retried once as SD, so a live reading still comes back. Only if SD fails too does the scan fall back to the labelled demo (D-042).
- **Units:** HD costs 12, 16, 20 or 22 units by concern count (SD: 9, 12, 14, 16). A full scan is 22. The ledger records `skin_analysis_hd` or `skin_analysis_sd`, and the reserve check budgets at the HD price.
- **Areas:** HD wrinkle areas (forehead, glabellar, crow's feet, periocular, nasolabial, marionette) and pore areas (forehead, nose, cheek) are stored with the scan. When a wrinkle or pore priority has them, the report says where it's most visible ("Most visible at the crow's feet").
- **Not yet recorded live.** Perfect Corp's documentation is still blocked from this workspace, so the names, prices and photo minimum come from their own pages as seen through web search. How the area scores arrive isn't documented there, so the reader accepts every plausible form (an `area` field, an object per area, or a type per area). The first HD scan on a phone confirms it; `src/lib/youcam/parse.ts` is the one file to adjust.
- **Comparisons:** each result records its engine. HD and SD scores are on different models, so progress comparisons (Week 3) compare like with like.

## D-047 · "What to expect": YouCam skin simulation of the plan (J + C, Oct 5)
Joshua asked for YouCam's AI Skin Simulation (brief 3.3 and 6.5). From YouCam's own docs (pasted by Joshua): `POST /s2s/v2.0/task/skin-simulation`, poll `GET /s2s/v2.0/task/skin-simulation/{task_id}`, a source file, and an intensity from 0.0 (as you are) to 1.0 ("full correction") per concern, at least one above 0. Ten concerns: radiance, acne, oiliness, eye bags, dark circles, spots, pores, texture, wrinkles, redness. Photos: short side at least 480, long side at most 2560, face at least 60% of the width. **4 units for 1 to 4 concerns, 6 for 5 to 10.**
- **What's simulated:** only the concerns the client's plan works on, so the picture illustrates the plan and nothing else. Firmness and eyelids can't be simulated and are left out.
- **How strongly:** at most 0.5, in YouCam's "balanced" band, and proportionally less when fewer sessions than a full course are booked. Never "full correction": that would show more than a course can honestly suggest.
- **When:** the first time an unlocked report is opened, so it only runs (and costs units) for clients who left their details. Live scans only: a demo reading never gets a picture that looks like a prediction. It respects the unit reserve (D-022).
- **Once per scan:** starting, finishing and failing are each claimed with a compare-and-set on the report (`reports.content`, `updated_at`), so two tabs or a double poll can never start two tasks or spend units twice. State lives in `reports.content.simulations`, no migration needed.
- **Privacy:** the result is copied into our private storage at the photo's size, served only through the report link, deleted with the client's data, and the task is deleted at YouCam.
- **Labelled every time:** "An illustration of likely improvement based on your scan. Not a guaranteed result. Everyone's skin responds differently." Captioned "Week N, illustrated", the week of the planned progress scan. If the simulation can't be made, the section simply isn't shown.
- **Not yet confirmed:** the docs' parameter reference wasn't available, so the request sends `src_file_id` plus one field per concern (`wrinkle`, `spot`, `dark_circle`, ...) and the response is searched for the first image link. Both sit in one block of `src/lib/youcam/client.ts`. If YouCam rejects the request, nothing is charged and the section stays hidden.

## D-048 · Priorities answer what the client came in for (J + C, Oct 5). Refines D-045
Joshua's first HD scan read "the same on every section": firmness 76, lower eyelid 76, eye bags 79, all with RF Skin Tightening, while his own goal ("Get rid of a lot of these sun spots") wasn't mentioned at all. The scores were real, but two things made every report sound alike:
- **YouCam's display scores bunch together** (most land between 75 and 99), and its lowest are nearly always around the eyes and firmness. Ranking by lowest score alone gives most people the same three priorities.
- **The client's goal only nudged the plan**, never the priorities, and their words were said back as the ticked box ("uneven tone"), not what they wrote ("sun spots").

Now:
- **Priority 1 is still the lowest score**, the scan's honest starting point. Ties on the display score fall to YouCam's finer raw measurement (lower eyelid 68.3 before firmness 68.7).
- **Priorities 2 and 3 weigh the client's goals in:** a concern they wrote about adds 20 points of need, one they ticked adds 12, but only where the scan shows room (under 92). Pores at 95 stay out however they were asked about, and the report says why.
- **Their own words win** and are said back: "You told us about sun spots, and your scan shows room to improve here."
- **Each line differs:** HD areas ("Most visible in the lines from mouth to chin"), "The same RF Skin Tightening sessions work on this too" instead of repeating the treatment, and a plain line when the plan doesn't target a priority.
- Grammar: "Pores are", "Firmness is".

For that scan the priorities become lower eyelid firmness, sun spots and wrinkles (mouth to chin), and the plan becomes RF Skin Tightening plus the Signature Peel Series ($1,290, inside the $1,000 to $2,000 band) instead of RF alone.

## D-049 · The clinic-side data model, and twelve demo clients per sandbox (J + C, Oct 6). Refines D-003 and D-014
Joshua chose to build the dashboard before booking: the rebook queue is what sets Rebloom apart, and it runs on seeded data with no keys. This is its foundation. Migration `20261006120000_clinic_side`.
- **Twelve demo clients, not five (J).** Five have starring roles and portraits, one per stage of the loop (D-003): Amelia (course complete, progress moment, wedding), Priya (new lead, follow-up due), Marcus (first consult today), Sofia (progress moment, next session unbooked), Grace (stalled, flagged before tomorrow's session). Seven more fill the client list and the queue: Hannah (weekly LED, on today's schedule), Olivia (booked from her report), Daniel (missed), Nina (maintenance due), Chloe (lapsed, no reminders consent), Isabel (scanned yesterday, so two days of time travel brings her follow-up) and Rachel (progress scan due). Every client status and every trigger in brief 3.4 is on screen when the dashboard opens. The cast is one file, `src/data/demo-clients.ts`.
- **Built in code around the sandbox's "today" (C).** D-014 imagined template rows copied in the database. Instead the copy is generated from the cast with days counted from the sandbox's today, so the demo always looks current. Past visits move back to an open day and future ones forward, so nothing crosses today, and no two visits overlap. With `DEMO_TODAY=2026-12-29`, Amelia's dates are the mockup's: scan 01 on October 5, scan 04 on December 28, her facial on Tuesday January 5, the wedding on January 11.
- **All or nothing, once (C).** The Supabase store copies through one database function, `seed_demo_clients`, so a sandbox gets every row or none. Two racing requests produce exactly one copy (unique `clients (clinic_id, sandbox_id, demo_key)`), and a bug in the bundle is raised rather than mistaken for "already copied". Each clinic in a sandbox gets its own copy.
- **Authored scores (D-004).** Each first scan starts from a sample profile; later scans list only what changed. Raw scores follow from them, and unit tests hold the story to the rebook thresholds (`src/lib/rebook/thresholds.ts`): Amelia's and Sofia's rescans clear the progress-moment delta of 5, and Grace's two rescans stay under the stalled delta of 2 on every priority.
- **Shared portraits are never deleted with a copy (C).** Every copy points at `demo/portraits/<key>.jpg` in storage. Anything under `demo/` is shared and read-only, so "Delete my data" on a demo client, or an expiring sandbox, removes the rows and leaves the portrait. Demo emails are `@example.com`, which never delivers.
- **One treatment room per clinic (C).** No two booked appointments in a sandbox may overlap, enforced by an exclusion constraint, so two bookings racing for one slot can't both win. Moving to one room per practitioner is a one-line change to the constraint (`staff_id` is already on every appointment).
- **Plans (C).** The report's suggested plan stays computed (D-045). The `plans` table holds what a practitioner proposed or confirmed, with menu prices fixed at that moment, at most one live plan per client.
- **The outbox (C).** `messages` logs every email the product sends or would send. A `dedupe_key` per client lets the rebook engine run as often as it likes without queuing the same message twice.
- **Time travel only moves forward (C).** `setClockOffset` refuses to wind a sandbox's clock back, so a stale tab can't undo another tab's jump.
- **Staff** are shared, not copied: Dana and Claire at Maison Verre, Maya and Rosa at Tidewater (C, Tidewater's names are placeholders).

## D-050 · A guarded Resend test route (J + C, Oct 6)
Joshua asked for Resend's starter route: one test email from `onboarding@resend.dev` to his own Gmail, returning the email id, or a 500 with the error. It lives at `POST /api/send`, with two changes from the starter (C):
- **It answers only to `Authorization: Bearer <CRON_SECRET>`**, like the YouCam check (D-044), and is a 404 to anyone else. As a public route, anyone who found it could send from the account and use up its free quota.
- **POST, not GET,** so a link preview or prefetch can never send an email.
Resend is reached only through `src/lib/email/resend.ts`, which imports `server-only`: if a client component ever imports it, the build fails, so the key can't reach a browser. To send the test: `curl -X POST https://<site>/api/send -H "Authorization: Bearer <CRON_SECRET>"`.
