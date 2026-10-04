# Maison Verre · Project Brief for Claude Code

**Read this whole file before writing any code.** It explains why we're building this, what the finished product does, how it should look and sound, and the order to build it in. When something here is unclear, make a sensible decision, note it in `DECISIONS.md`, and keep moving. Only stop to ask when a decision would be expensive to reverse.

Owner: Joshua (product director). You (Claude Code) handle implementation. Joshua is not a developer, so explain anything he needs to do himself (accounts, keys, settings) in plain, step-by-step language.

---

## 1. Why we're building this

### The competition
We are entering the **YouCam API Skin AI & eCommerce VTO Hackathon**, run by Perfect Corp on Devpost.

- **Deadline:** Monday November 2, 2026, 11:45am US Eastern (that's Tuesday November 3, 3:45am Sydney time). **We aim to submit on Sunday November 1** to leave a buffer.
- **Rule:** the project must integrate at least one YouCam API and show clear consumer or retail value. They want "fresh, unexpected uses of the technology, not surface-level wrappers."
- **Judging criteria (equal weight):**
  1. **Technological implementation:** thorough, skilful, non-trivial use of the YouCam API.
  2. **Design:** a complete, coherent product experience, not a proof of concept.
  3. **Potential impact:** a credible, specific case for solving a real problem for a real audience.
  4. **Quality of the idea:** creative, non-obvious, and shows real understanding of the problem space.
- **Topic we're entering:** Skin AI. Their brief says people wonder about their skin "right before a purchase, right after a bad breakout, right when they're standing in front of a mirror deciding whether something is working."

### What we learned from the previous round
Perfect Corp ran this same hackathon in July/August 2026. The 5 winners out of 238 entries were mostly **merchant-side tools** and **trust/honesty** plays. Most losing entries were consumer "upload a selfie, get a routine" apps, and several were "is my skincare working?" progress trackers. So:

- A plain scan app or progress tracker will not stand out.
- Perfect Corp already markets "skin scan on a clinic website that recommends treatments." If we only build that, judges will see it as obvious.
- **Our edge is the business outcome, not the scan:** we're building the system that gets skin clinic clients to come back.

### The problem
Cosmetic skin clinics in the US (medspas, cosmetic dermatology, esthetician studios, laser and facial clinics) run on **repeat visits**. Almost every treatment is sold as a series: chemical peels (3 to 6 sessions), microneedling (3 to 6), IPL (3 to 5), laser hair removal (6 to 8+), monthly facials, injectables every 3 to 4 months. A client who does one session and disappears is barely profitable.

Clinics already know clients should come back. What they lack is **proof to show the client why it's worth coming back**, and a system that notices when a client is drifting away.

### Our answer
**Maison Verre: the retention engine for skin clinics, powered by measured skin results.**

1. A beautiful scan page turns a website visitor into a booked consult with a personal skin report.
2. The clinic gets a practitioner brief before the client walks in.
3. Progress scans between sessions measure real change.
4. Measured improvement triggers the rebooking moment ("Your texture score went from 58 to 71. One more session gets you to your goal.").
5. Stalled progress or missed scans flag the client as at-risk before they quietly leave.
6. The clinic owner sees revenue retained, not just leads captured.

"Maison Verre" is the fictional demo clinic. The product is white-label: every clinic gets its own branding. For the hackathon, Maison Verre is the face of the demo.

### Positioning line
**Everyone sells the scan. We sell the second visit.**

---

## 2. Who uses it

| User | What they need |
|---|---|
| **Prospective client** (on their phone) | Understand their skin, see a plan that fits their goal and budget, book easily. Trust that their photo is handled properly. |
| **Returning client** | See measured progress, know what's next, rebook with one tap. |
| **Practitioner** (esthetician, nurse) | A fast, clear brief before each consult. Flags to review. A suggested plan they can adjust. |
| **Clinic owner** | Leads, bookings, rebook rate, clients at risk, revenue retained. Simple setup of their treatment menu. |
| **Hackathon judge** | Understand the value in seconds, try it without friction, see real YouCam API use. |

Market: **United States**. US English, US dates (October 5, 2026), US dollars.

---

## 3. The finished product: what it does

### 3.1 Client journey
1. **Landing on the clinic's scan page** (`/c/maison-verre`). Calm, luxurious, one clear promise: "See your skin clearly." One button to start.
2. **Consent.** Plain-English explanation before the camera opens: what we analyse, what's stored, for how long, who sees it, how to delete. Explicit checkbox consent for face image processing (biometric consent). Separate optional checkbox for progress reminders by email. Cannot continue without the first one.
3. **Intake (4 short questions, one per screen, tappable answers):**
   - What bothers you most when you look in the mirror? (multi-select: uneven tone, texture, pores, fine lines, redness, breakouts, dullness, firmness, other)
   - Any event coming up? (none / yes, with date picker and event type: wedding, holiday, reunion, other)
   - Treatments before? (none / facials / peels / microneedling / laser or IPL / injectables / other)
   - Roughly what would you like to invest? (under $500 / $500 to $1,000 / $1,000 to $2,000 / $2,000+)
   - Plus standard pre-treatment screening questions clinics already ask (current retinoid use, recent sun exposure or tan in last 2 weeks, pregnant or breastfeeding, recent isotretinoin use, active cold sores, skin sensitivities). These are **never used to block or decide anything**. They only create flags for the practitioner to review.
   - First name and email (to send the report link). Phone optional.
4. **Capture with quality gate** (see section 6.2). Live camera with a face guide. The capture button only activates when the photo will produce a reliable result. Option to upload a photo instead.
5. **Processing screen.** Elegant, slow, honest progress states ("Reading texture", "Mapping tone", "Writing your report"). Analysis can take a while; never fake a percentage.
6. **The living report** (`/r/[token]`). See section 3.3. Private link, emailed to the client.
7. **Booking.** Pick a time, pay a refundable deposit (Stripe test mode), get a confirmation email.
8. **Between sessions:** emailed nudges at planned progress-scan points. A rescan takes 2 minutes from home using the same capture flow and the same instructions.
9. **Progress view.** The same report link now shows progress: side-by-side scans, score changes, practitioner note, and the next recommended step.

### 3.2 Clinic journey
1. **Dashboard login** (Supabase Auth, email magic link) plus a **"Enter demo as Dana"** button for judges.
2. **Today:** upcoming consults, each with a practitioner brief.
3. **Practitioner brief** (per client): face map, lowest scores, goals in their own words, event date, budget, past treatments, Fitzpatrick type if available, pre-treatment flags, suggested plan with prices, "Confirm plan with client" and an editable practitioner note that appears on the client's report.
4. **Clients:** list with status (new lead, booked, in course, course complete, at risk, lapsed) and last score change.
5. **Rebook queue:** clients the engine thinks should be contacted now, why, and a one-click "Send rebook message" with a pre-written, editable email.
6. **Insights (owner view):** scans this month, report-to-booking conversion, rebook rate, clients at risk, revenue booked from reports, revenue retained through rebooking. Simple, beautiful charts.
7. **Settings · Menu:** the clinic's treatments (name, description, price per session, typical session count, interval between sessions, which skin concerns it addresses, any related screening flags) and retail products (name, price, concerns addressed). This menu is the only source the AI may recommend from.
8. **Settings · Brand:** clinic name, logo, accent colour. (For the hackathon, Maison Verre is preset. White-label just needs to visibly work, for example a second demo clinic or a brand preview.)
9. **Settings · Integrations:** a "Connects to" screen showing Boulevard, Vagaro, Zenoti, Mindbody, Square Appointments, and webhook/Zapier as "coming soon" cards. **Do not build these integrations.** Only show the screen. Use plain text names, no third-party logos.

### 3.3 The report: what makes it better than everyone else's
Existing skin reports are a radar chart, 15 numbers and a product list. They fail because they have too many numbers with no meaning, no clear next step, and they die the moment you close them. Ours:

- **Leads with their face, not a chart.** Their photo with tappable concern overlays (texture, pigmentation, pores and so on) built from the YouCam detection masks.
- **Three priorities, not fifteen.** Top 3 concerns ranked, explained in plain words. The other scores sit behind "See full analysis".
- **Every score translated into meaning.** Not "Texture 58" but "Texture is your biggest opportunity, and the area most likely to show visible change with treatment."
- **A plan on a timeline.** Sessions mapped to dates, ending at their event if they gave one. Prices and session counts upfront. Built only from the clinic's real menu.
- **Simulated result, honestly labelled** (stretch feature, see 6.5): "An illustration of likely improvement based on your scan. Not a guaranteed result."
- **One action.** "Book your first session" with the next real available time.
- **Home care between sessions.** The clinic's own retail products matched to their concerns.
- **It's a living page, not a PDF.** The same private link becomes their progress page after every rescan. The report IS the retention engine.
- **White-labelled.** Clinic name, logo and accent colour.

### 3.4 The rebook engine (the heart of the product)
Rules-based, transparent, and explained in the dashboard (each queue item says why it's there). Use these triggers; make thresholds configurable constants:

| Trigger | When | Action |
|---|---|---|
| Report, no booking | 3 days after report, no appointment | Follow-up email to client; client shows as "lead" in queue |
| Next session due | Course in progress, next session date within interval, not yet booked | Reminder email 3 days before due date; queue item |
| Progress scan due | Scheduled scan date reached | Email with rescan link |
| Progress moment | Rescan shows meaningful improvement (raw score delta ≥ 5 points on a priority concern) | Report updates with celebration of real change plus next-step CTA; queue item "great moment to rebook" |
| Stalled | Two consecutive scans with < 2 point change on all priority concerns | Flag "at risk" for practitioner review, suggest a plan adjustment |
| Missed | Scan or session overdue by 14+ days | Flag "at risk"; queue item with a gentle check-in message |
| Course complete | All planned sessions done | Maintenance recommendation at the treatment's maintenance interval |

**For the demo:** add a "time travel" control in the dashboard (demo mode only) to jump the clock forward so judges can watch triggers fire. Seed enough demo clients that every status and trigger is visible immediately.

---

## 4. Tech stack

Keep it simple, modern and deployable by a solo non-developer.

- **Framework:** Next.js (latest stable, App Router) with TypeScript.
- **Styling:** Tailwind CSS with the design tokens in section 7 as theme variables. No component library that fights the brand. Hand-built components.
- **Database, auth, storage:** Supabase (Postgres, Row Level Security, Auth with magic link, Storage with a **private** bucket for face images, served via short-lived signed URLs).
- **Skin analysis:** YouCam API (Perfect Corp), server-side only. See section 6.
- **Report writing:** Anthropic Claude API (use the current Sonnet model; check the Anthropic docs for the exact model string), server-side only, structured JSON output.
- **Face detection for the capture gate:** MediaPipe Tasks Vision (Face Landmarker) running in the browser.
- **Email:** Resend.
- **Payments:** Stripe in **test mode only** (deposits at booking).
- **Hosting:** Vercel. Code on GitHub (account: daboss23). Repo name: `maison-verre`.
- **Charts:** Recharts or hand-built SVG, styled to the brand.

**Environment variables** (document all in `.env.example` and the README):
`YOUCAM_API_KEY`, `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `APP_URL`, `DEMO_MODE`, `YOUCAM_MODE` (`live` or `fixture`).

**Never** expose the YouCam, Anthropic, Supabase service role, Stripe secret or Resend keys to the browser.

---

## 5. Data model (starting point; refine as needed)

- `clinics`: id, slug, name, logo_url, accent_hex, timezone, city, settings json
- `staff`: id, clinic_id, user_id, name, role (owner, practitioner)
- `treatments`: id, clinic_id, name, description, price_cents, sessions_typical, interval_days, maintenance_interval_days, concerns text[], screening_flags text[], active
- `products`: id, clinic_id, name, description, price_cents, concerns text[]
- `clients`: id, clinic_id, first_name, email, phone, status, created_at
- `consents`: id, client_id, type (biometric, reminders), granted_at, text_version, ip, user_agent
- `intakes`: id, client_id, concerns text[], event_type, event_date, past_treatments text[], budget_band, screening json, notes
- `scans`: id, client_id, scan_number, image_path, capture_quality json, youcam_task_id, youcam_raw json, scores json (normalized), skin_age, created_at, source (live, fixture)
- `reports`: id, client_id, token (unguessable), content json (Claude output), practitioner_note, version, updated_at
- `plans`: id, client_id, status, confirmed_by, confirmed_at, total_cents
- `plan_items`: id, plan_id, treatment_id or product_id, sessions, sequence, target_date
- `appointments`: id, client_id, treatment_id, starts_at, status, deposit_payment_intent, deposit_status
- `messages`: id, client_id, type, channel, subject, body, status, scheduled_for, sent_at (an outbox; in demo mode emails go to a visible log, not real inboxes, unless an address is a verified test address)
- `events`: id, client_id, type, payload json, created_at (audit trail and engine input)
- `api_usage`: id, provider, feature, units, task_id, created_at (track YouCam unit spend)

Row Level Security: staff see only their clinic's data. Clients access their report only through the unguessable token, served via server routes.

**Data deletion:** "Delete my data" on the report deletes the client's images from storage and their personal data from the database (keep only an anonymised event for counts). Confirm before deleting.

---

## 6. YouCam API integration

### 6.1 Rules
- **Read the official docs before writing integration code.** Do not guess endpoints or field names:
  - Skin analysis: https://docs.perfectcorp.com/reference/ai_skin_analysis
  - Quick start: https://docs.perfectcorp.com/develop/quick_start_guide
  - Full API docs: https://yce.perfectcorp.com/document/index.html
- YouCam also publishes Agent Skills for Claude Code (`npx skills add YouCam-API/youcam-skills-test`, see their blog). Install the skin analysis skill if it helps you follow their API correctly.
- Auth is a Bearer token in the `Authorization` header. Base URL in the docs (currently `https://yce-api-01.makeupar.com`).
- The V2 flow, per the docs:
  1. `POST /s2s/v2.0/file` (or `/s2s/v2.0/file/skin-analysis`, check the docs) with file metadata → returns `file_id` and a pre-signed `PUT` URL with required headers.
  2. `PUT` the image bytes to that URL with exactly those headers. (Skipping this causes 404 or 500 errors later.)
  3. `POST /s2s/v2.0/task/skin-analysis` with `src_file_id`, `dst_actions` (list of concerns), `format: "json"` and any `miniserver_args` → returns `task_id`.
  4. Poll `GET /s2s/v2.0/task/skin-analysis/{task_id}` until `task_status` is `success` or `error`. Execution time is not guaranteed. Poll with backoff. A v2.1 version supports webhooks; polling is fine for us.
  5. Results include per-concern `ui_score`, `raw_score` and `mask_urls` (detection masks to overlay on the photo). Results are kept for **24 hours**, so **download and store masks and scores in our own storage immediately**.
- **Use SD concerns, not HD.** SD needs a short side of at least 480px; HD needs 1080px and costs more. **SD and HD concerns cannot be mixed** in one request.
- SD concern names: `wrinkle`, `droopy_upper_eyelid`, `droopy_lower_eyelid`, `firmness`, `acne`, `moisture`, `eye_bag`, `dark_circle_v2`, `age_spot`, `radiance`, `redness`, `oiliness`, `pore`, `texture`, `tear_trough`, `skin_type`. Confirm against the docs. Response also includes an overall `all` score and `skin_age`.
- Map every concern to a client-friendly name: `age_spot` → "Pigmentation", `dark_circle_v2` → "Dark circles", `pore` → "Pores", `droopy_upper_eyelid` → "Upper eyelid firmness", and so on. Never show raw API names to clients.

### 6.2 Photo quality matters more than anything
The docs require: face width **greater than 60% of image width**, front-facing, eyes open, mouth closed, forehead visible, even bright lighting without blown highlights, no glasses ideally, no makeup ideally, portrait orientation, in focus. Error codes include `error_src_face_too_small`, `error_src_face_out_of_bound`, `error_lighting_dark`, `error_below_min_image_size`.

Build a **capture quality gate** in the browser that checks, live, before allowing capture:
- Exactly one face detected
- Face width ≥ 62% of frame width (a little stricter than the API)
- Face centred within tolerance
- Head pose roughly frontal (yaw and pitch within about ±10°, use Face Landmarker transforms)
- Brightness in range and not over-exposed (luminance histogram of the face region)
- Sharpness above a threshold (variance of Laplacian on the face region)
- Eyes open (blendshapes)

Show one short, calm instruction at a time ("Move a little closer", "Face the light", "Hold still"). When all checks pass, auto-capture after a 1 second hold or let them tap. Save the quality metrics with the scan. If the API still returns an image error, show a friendly retry screen that explains exactly what to fix.

**Rescans use identical instructions** so progress comparisons are fair. Show "Same light, same angle. Verified at capture." on the progress view when both scans passed the gate.

### 6.3 Unit budget (critical)
We have **1,000 free units**. Per the docs, SD skin analysis costs **9 units for 1 to 4 concerns, 12 for 5 to 8, 14 for 9 to 12, 16 for 13 to 16**. A full scan is about 16 units, so **roughly 60 live scans in total**. Failed tasks don't consume units.

Therefore:
- Build a **fixture mode** (`YOUCAM_MODE=fixture`): a set of saved real responses (scores plus masks) that the app uses during development and for seeded demo clients. Capture fixtures from our first few live calls and store them in the repo (anonymised; use Joshua's own test photos only with his consent, or licensed stock).
- Only call the live API when `YOUCAM_MODE=live`.
- Log every live call in `api_usage` with units spent. Show remaining budget in the dashboard (demo mode).
- Rate-limit the public live scan (for example 3 per IP per day) so judges can't drain the account.
- Joshua may buy extra units before judging if needed (1,000 units is $179).

### 6.4 Which score to use
YouCam's docs say `ui_score` is adjusted upward "as a psychological motivator," while `raw_score` is the underlying measurement. Decision:
- **Client-facing display uses `ui_score`** (consistent with how Perfect Corp's own products present results).
- **All progress maths, deltas and rebook triggers use `raw_score`.** That keeps our progress claims honest.
- The practitioner brief shows both.
- Write this decision into the README. It's a credibility point for the judges: we measure progress on the raw data, not the flattering number.

### 6.5 Optional extras (only after the core works)
- **Skin tone / Fitzpatrick analysis** for the practitioner brief.
- **Skin simulation** for the "What to expect" section. Check the docs for the endpoint and unit cost. Always label it as an illustration, never a guarantee. If cost or quality is a problem, drop it and remove the section. Never show simulated images in anything that looks like an ad.

---

## 7. Brand and design system

### 7.1 Brand
- **Demo clinic:** Maison Verre, Santa Monica, California.
- **Name story:** "Verre" is French for glass. Named in the spirit of the Maison de Verre in Paris, a glass house famous for honesty of materials and light. The brand stands for clarity: seeing your skin as it really is, and honest, measured progress.
- **Tagline:** Skin, seen clearly.
- **Hero line on the scan page:** See your skin clearly.

### 7.2 Logo files (in `/brand`, transparent PNGs)
| File | Use |
|---|---|
| `mv-lockup.png` | Full logo with tagline. Landing hero, report footer, video intro/outro, Devpost cover. Min width 200px. |
| `mv-lockup-no-tagline.png` | Mid-size spots: email header, dashboard login, social banners. |
| `mv-monogram.png` | Small spots: favicon, app icon, report header (30px tall next to the wordmark), loading states, watermark on scan images. |

Generate favicon sizes from the monogram. Never stretch, recolour, add effects, or place the champagne monogram on mid-tone backgrounds where it loses contrast. On the dark ink background, use the lockup on a porcelain card or provide an inverted wordmark (porcelain text, champagne monogram) built in CSS/SVG.

In the header, pair the monogram image with the wordmark set as live text: "MAISON VERRE" in Cormorant Garamond, weight 500, 15 to 17px, letter-spacing 0.32em.

### 7.3 Colour tokens
| Token | Name | Hex | Use |
|---|---|---|---|
| `--bg` | Porcelain | `#F7F4EF` | Page background |
| `--ink` | Ink | `#1C1C1A` | Primary text, dark sections, primary buttons |
| `--accent` | Champagne | `#C9B79C` | Accent fills: main CTA button on dark sections, score bars, timeline, hairline highlights. **Never as text on porcelain** (fails contrast). |
| `--surface` | Mist | `#E6E2DA` | Cards, image placeholders, chips, hairline dividers |
| `--detail` | Sage grey | `#8C9A8F` | Decorative only, never body text |
| `--text-2` | Secondary text | `#3F4440` | Body copy |
| `--text-3` | Caption text | `#5E655F` | Captions, labels, meta (passes AA on porcelain) |
| `--bronze` | Bronze | `#9C7A54` | Mask outlines, small icon accents, flags |
| `--ink-soft` | Soft ink text on dark | `#C9C3B8` | Secondary text on ink sections |

Rules: one accent, used sparingly. No gradients. No heavy shadows (at most a barely visible 1px hairline). All text must meet WCAG AA contrast.

### 7.4 Typography
- **Display and headings:** Cormorant Garamond (Google Fonts), weights 300 to 500. Light (300) for big headlines and big numbers.
- **Body and UI:** Inter (Google Fonts), weights 300 to 500.
- Load via `next/font/google`.
- Type scale (mobile first): H1 40 to 44px / 1.08, light, slight negative tracking. H2 30px regular. Body 15px / 1.6, weight 300 to 400. Labels 11px uppercase, letter-spacing 0.14em, caption colour. Big score numbers 56 to 64px Cormorant light, with a small "/100" in Inter.
- Numbers in thin serif look premium. Bold numbers look like a fitness app. Don't.

### 7.5 Layout and components
- Mobile first. The client experience is designed for phones (390px wide); it must also look excellent on desktop (centred column, max width about 560px for the report, wider for the dashboard).
- Generous white space. When in doubt, add more.
- Sharp corners (radius 0 to 2px). Hairline borders (1px, mist or champagne).
- Buttons: 44px+ tall. Primary on porcelain = ink background, porcelain text. Primary on ink = champagne background, ink text. Secondary = 1px border, transparent.
- Chips/toggles for concerns: 44px tall, 1px ink border, selected = ink fill.
- Score bars: 2px tall, mist track, champagne fill.
- Timeline: 9px dots, 1px champagne line.
- Icons: thin line icons only (1 to 1.5px stroke). **No emoji anywhere. No cartoon icons.**
- Photography: warm, soft, natural light. Image placeholders are mist blocks with a small uppercase caption.
- Motion: slow fades and gentle reveals (300 to 600ms, ease-out). Nothing bouncy. Respect `prefers-reduced-motion`.
- Accessibility: real buttons and links, labels on inputs, focus states visible (1px ink outline offset 3px), alt text, keyboard navigable dashboard.

### 7.6 Reference mockup
`/reference/Maison_Verre_Skin_Report_Mockup.pdf` shows the agreed look for three screens: the client report, the week 12 progress report, and the practitioner brief. Match its look, spacing and hierarchy closely. Joshua also has a live canvas of the same mockup.

### 7.7 Voice and copy rules
- **Voice:** calm, precise, unhurried. Speaks like a trusted senior practitioner, not a marketer. Short sentences. Warm but never gushing.
- Example: "Your skin is telling a clear story. Here's what we see, and where we'd begin."
- **Never use em dashes (—) in any copy, UI text, emails or AI-generated text.** Use full stops, commas or "·" as a separator.
- Plain language. No jargon without an explanation.
- **Banned words and phrases:** glow up, flawless, perfect skin, miracle, transform your life, anti-aging secret, diagnose, diagnosis, cure, treat [a condition], guaranteed, results guaranteed, problem skin, flaws, imperfections, fix your face.
- Say "concerns", not "problems" or "flaws". Say "visible", "looks", "appearance". This is cosmetic, never medical.
- Never shame. Lower scores are "opportunities", "where we'd begin", "the area most likely to show change".
- No third-party trademarks in UI, demo data or video: say "hydrating infusion facial", not HydraFacial; "anti-wrinkle injections" only if needed, never Botox.

---

## 8. AI report generation (Claude)

### 8.1 Inputs
Normalized scores (ui and raw), skin age, intake answers, screening flags, the clinic's full menu (treatments and products with concerns, prices, sessions, intervals), clinic availability, today's date, event date, and for progress reports the previous scans and the practitioner's note.

### 8.2 Output
Strict JSON validated with Zod. Suggested shape:
- `headline` (e.g. "Amelia, your skin is telling a clear story.")
- `subhead`
- `priorities`: exactly 3 items `{ concern_key, title, meaning }`
- `concern_explanations`: one short plain explanation per priority concern for the face map
- `plan`: ordered items referencing **treatment and product IDs from the menu only**, with sessions and target dates, plus a short `rationale`
- `timeline`: dated steps, ending at the event if there is one, with rest time before the event
- `investment`: line items and total, computed in code from menu prices (do not let the model do arithmetic; compute totals in code)
- `home_care`: up to 2 product IDs with one-line reasons
- `practitioner_summary`: 2 to 3 sentences for the brief
- For progress reports: `progress_headline`, per-concern `progress_notes`, `next_step`

### 8.3 Guardrails (enforce in code, not just in the prompt)
- Recommend **only** IDs that exist in the clinic's active menu. Reject and regenerate otherwise.
- Respect budget band: if the plan exceeds the band, include a lower-cost alternative.
- Respect event timing: no aggressive treatments in the 2 weeks before an event (use treatment metadata).
- Screening flags never block a recommendation. They appear as "Review before treatment" items for the practitioner.
- No medical language, no promises, no banned words, no em dashes. Run a post-generation check that strips em dashes and rejects banned words.
- Never mention scores the client can't see, never invent numbers.
- Fallback: if generation fails twice, render a template report from the scores and menu mapping so the client always gets a result.

---

## 9. Demo clinic data (seed this)

**Clinic:** Maison Verre · 1200 Montana Avenue, Santa Monica, CA (fictional address) · timezone America/Los_Angeles · open Tue to Sat, 10am to 6pm.
**Staff:** Dana (Lead Aesthetician, practitioner), Claire (Owner). Demo login enters as Dana; owner insights visible to both in demo mode.

All prices are demo prices.

| Treatment | Price / session | Typical sessions | Interval | Concerns addressed |
|---|---|---|---|---|
| Signature Peel Series | $195 ($585 for 3) | 3 | 3 weeks | texture, age_spot, acne, oiliness, radiance |
| Microneedling | $395 | 3 | 4 to 6 weeks | texture, pore, wrinkle, firmness |
| IPL Photofacial | $350 | 3 | 4 weeks | age_spot, redness |
| Hydrating Infusion Facial | $185 | monthly | 4 weeks | moisture, radiance, pore, oiliness |
| LED Light Therapy | $85 | 6 | 1 week | acne, redness, radiance |
| RF Skin Tightening | $450 | 3 | 4 weeks | firmness, wrinkle, droopy eyelids |
| Signature Facial | $165 | monthly | 4 weeks | radiance, moisture, dark_circle_v2, eye_bag |

| Product | Price | Concerns |
|---|---|---|
| Barrier Repair Serum | $68 | redness, moisture, post-peel care |
| Mineral SPF 40 | $42 | age_spot, protecting results |
| Brightening Vitamin C Serum | $74 | radiance, age_spot |
| Gentle Cream Cleanser | $36 | all, sensitive skin |

**Hero demo client:** Amelia R., 34. Concerns: uneven tone, texture. Wedding January 11. Budget $1,000 to $2,000 band. No past treatments. Retinol nightly, beach holiday 2 weeks ago (two practitioner flags). Scan 01 October 5: texture 58, pigmentation 61, pores 66 (ui scores). Plan: peel series × 3, microneedling × 1, two home care products. Progress at scan 04 (December 28): texture 71, pigmentation 70, pores 69. Course complete; Dana recommends one final peel on January 4.

**Seed about 15 more demo clients** across every status (new lead with no booking, booked, mid-course with a progress moment, stalled, missed scan, course complete due for maintenance, lapsed) with varied concerns, ages, skin tones, budgets and events, so the dashboard and rebook queue look alive. Use fixture scans for all of them.

---

## 10. Compliance and trust (build it in from day one)
This is not legal advice; it's good practice that also scores points with judges.
- **Biometric consent:** some US states (Illinois BIPA, Texas, Washington) have strict rules on face data. Before the camera opens: clear notice of what's collected, purpose, retention period (default: until the client deletes it, or 12 months after their last visit), who can see it, and explicit opt-in. Store a consent record with the consent text version.
- **Delete anytime:** one-click data deletion from the report page.
- **Honest labelling:** any simulated image is labelled as an illustration, not a guaranteed result (FTC truth-in-advertising applies to the page).
- **Cosmetic, not medical:** footer on every report: "This is a cosmetic assessment of visible skin, not a medical diagnosis. Scores come from AI skin analysis and are reviewed by your practitioner."
- **Security:** private storage bucket, signed URLs, unguessable report tokens, RLS, no secrets in the client bundle, no face images in logs.
- Add a short Privacy page and Terms page (plain English, marked as demo).

---

## 11. Routes (suggested)

| Route | What |
|---|---|
| `/` | Product landing page for judges and clinics: the problem, the loop, "Try the client experience" and "Enter the clinic dashboard" buttons, YouCam APIs used, short video embed later |
| `/c/[clinicSlug]` | Clinic-branded scan start page |
| `/c/[clinicSlug]/consent`, `/intake`, `/capture`, `/processing` | Client flow |
| `/r/[token]` | Living report (initial report, then progress view after rescans) |
| `/r/[token]/rescan` | Progress scan flow |
| `/r/[token]/book` | Booking and Stripe deposit |
| `/dashboard` | Today |
| `/dashboard/clients`, `/dashboard/clients/[id]` | Client list, practitioner brief and history |
| `/dashboard/rebook` | Rebook queue |
| `/dashboard/insights` | Owner metrics |
| `/dashboard/settings/menu`, `/brand`, `/integrations` | Settings |
| `/privacy`, `/terms` | Plain-English policies |

---

## 12. Build plan (4 weeks)

Work in phases. At the end of each phase: everything runs, it's deployed to Vercel, committed with clear messages, and you write a short "what's done, what's next, anything Joshua must do" note in `PROGRESS.md`.

### Week 1 (Oct 6 to 12) · Foundation and the scan pipeline
- Repo, Next.js, Tailwind tokens, fonts, logo assets, base components (buttons, chips, labels, score bar, hairline sections).
- Supabase project, schema, RLS, storage bucket, seed script for the demo clinic and menu.
- Client flow: scan start page, consent, intake, capture with the full quality gate, upload.
- YouCam integration: file upload, task, polling, store scores and masks, error handling, `api_usage` logging, fixture mode.
- **Done when:** a real phone can complete consent → intake → capture → live analysis, and scores plus masks are stored. Fixture mode works with no API calls.

### Week 2 (Oct 13 to 19) · The report and booking
- Claude report generation with JSON schema, guardrails, fallback.
- Living report page matching the mockup: face map with mask overlays and concern toggles, 3 priorities, full analysis, timeline, investment, home care, CTA, footer.
- Booking with available slots, Stripe test deposit, confirmation email (Resend).
- Report email with private link.
- **Done when:** a new visitor gets a beautiful, accurate, personal report on their phone and can book with a test deposit.

### Week 3 (Oct 20 to 26) · The clinic side and the retention loop
- Dashboard auth plus "Enter demo as Dana".
- Practitioner brief, client list and history, editable practitioner note.
- Rescan flow, progress view on the report link, score comparisons using raw scores, sparklines.
- Rebook engine (triggers in 3.4), outbox, rebook queue with editable messages, time-travel control in demo mode.
- Insights dashboard. Menu settings. Integrations "coming soon" screen. Brand settings basics.
- 15 seeded demo clients across all statuses.
- **Done when:** the full loop works end to end in demo mode, and the dashboard tells the retention story at a glance.

### Week 4 (Oct 27 to Nov 1) · Polish and submission
- Design polish pass against the mockup on real phones (iPhone Safari and Android Chrome) and desktop.
- Performance, loading and error states, empty states, accessibility pass, copy pass (no em dashes, no banned words).
- Optional extras if time allows: skin simulation, skin tone/Fitzpatrick.
- Product landing page (`/`).
- README (see section 13), screenshots, architecture diagram.
- Help Joshua record the demo video (he'll script and shoot it; give him a shot list of screens and states to show).
- Final check against the submission requirements. **Submit by Sunday November 1.**

---

## 13. Hackathon submission requirements

- **Repo:** public with an MIT licence, or private and shared with contact_event@PerfectCorp.com. Must contain all source code, assets and instructions needed to run it.
- **README:** what it is, the problem, who it's for, how it works (the loop), every YouCam API used and exactly how (endpoints, concerns, masks, our ui_score vs raw_score decision), architecture, how to run locally (fixture mode needs no YouCam key), env vars, screenshots, live demo URL, demo login instructions, and known limitations.
- **Text description** for Devpost: features, functionality, clear consumer and retail value.
- **Screenshots** of the main screens.
- **Demo video:** 1 to 3 minutes, on YouTube, public. Must explain the YouCam API used and show it working on the device it was built for (a phone). **No third-party trademarks or copyrighted music.** Use royalty-free or original music.
- Winners do an exit interview and a blog article.

---

## 14. Quality bar (definition of done)
- It works on a real phone, start to finish, with no dead ends.
- It looks like the mockup: luxurious, calm, minimal. If a screen looks like a generic SaaS template, it's not done.
- Every number shown is real (from the API or computed from it) or clearly demo data.
- The AI never recommends something not on the menu and never uses medical or banned language.
- Fixture mode lets anyone run the whole thing without a YouCam key.
- No secrets in the browser. No face images in logs. Deletion works.
- Loading, empty and error states are designed, not default.
- `README.md`, `DECISIONS.md` and `PROGRESS.md` are up to date.

## 15. Out of scope for the hackathon
- Real integrations with booking systems or CRMs (show the "coming soon" screen only).
- SMS (email only; mention SMS as coming soon).
- Real payments (Stripe test mode only).
- Multi-location clinics, staff scheduling, inventory.
- Native mobile apps (it's a responsive web app).
- Medical dermatology or any diagnosis.

---

## 16. How to start
1. Read this brief and the reference mockup PDF.
2. Write `PLAN.md`: your technical plan for Week 1, the folder structure, and the exact list of accounts and keys Joshua needs to create, with step-by-step instructions for each (Supabase, YouCam, Anthropic, Resend, Stripe test mode, Vercel). Keep it plain English.
3. Wait for Joshua to confirm the keys are in place, then build Week 1.
