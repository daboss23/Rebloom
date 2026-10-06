# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- **Practitioner (Dana, Lead Aesthetician at Maison Verre).** Opens the clinic dashboard every morning between clients, on a desktop at the front desk or in the treatment room. Her job: know who to contact today and why, prepare for today's visits, confirm plans, and send rebook messages.
- **Clinic owner (Claire).** Checks Insights: revenue kept through rebooking, rebook rate, reports that became bookings, clients at risk.
- **Clients.** Scan their face on their phone, get a living report, book, rescan between sessions. They only ever see the clinic's brand.
- **Hackathon judges.** Enter the dashboard with "Enter demo as Dana" and click freely, including moving the clock forward.

## Product Purpose
Rebloom is a retention engine for skin clinics. Clinics sell courses of treatment, but most clients stop after one session. Rebloom turns a skin scan into measured proof that treatment is working, and turns that proof into the next booking. Success: the second visit gets booked.

## Positioning
"Everyone sells the scan. Rebloom sells the second visit." The rebook engine is rules-based and transparent: every queue item says, in one sentence, why that person should be contacted now, measured on raw scan data.

## Operating Context
- The dashboard answers one question each morning: who should we contact today, and why?
- Rebloom is the platform (dashboard, landing, README). Clinic-facing client pages carry only the clinic's brand (DECISIONS D-001).
- Every browser gets its own sandbox with a copy of twelve demo clients (D-013, D-014, D-049). Time travel moves the sandbox clock forward only (D-016).
- Demo emails go to a visible log, never a real inbox. Live emails go through Resend.

## Capabilities and Constraints
- Next.js App Router, TypeScript, Tailwind v4, Supabase (or a local file store with no keys).
- Dashboard screens: Today, Clients, practitioner brief, Rebook, Insights, Settings (Menu, Brand, Connects to).
- Integrations (Boulevard, Vagaro, Zenoti, Mindbody, Square Appointments, Zapier) are "coming soon" text cards only. Stripe test mode for deposits.
- Cosmetic, never medical. No em dashes anywhere. Banned words are in BRIEF.md 7.7.

## Brand Commitments
- **Rebloom (dashboard):** a cool, glacial identity chosen by Joshua on Oct 6 from his references (clean, cool, fresh, invigorating, luxury, minimal). Frost, ice mist, deep charcoal and one glacier accent. Cormorant Garamond display, Inter UI. Sharp corners, hairlines, no gradients, no decorative glass, slow fades.
- **Maison Verre (client pages):** porcelain, ink, champagne (BRIEF.md section 7). Unchanged.
- Voice: calm, precise, unhurried. A trusted senior practitioner, not a marketer.

## Evidence on Hand
- Twelve authored demo clients in `src/data/demo-clients.ts`, labelled as demo data. Demo portraits are still to be supplied (D-030); until then, portraits fall back to placeholders.
- Demo prices in `src/data/menu.ts`. Never invent customers, testimonials or benchmarks.

## Product Principles
1. One question first: who to contact today, and why.
2. Every number is computed from data, never typed in.
3. Explain every flag in one plain sentence.
4. Nothing reaches a client without the practitioner seeing it.
5. Fewer, better numbers. No widget walls.

## Accessibility & Inclusion
WCAG AA contrast on all text. Keyboard navigable dashboard. Visible focus: 1px ink outline, offset 3px. Respect reduced motion.
