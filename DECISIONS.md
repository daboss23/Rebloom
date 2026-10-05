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
