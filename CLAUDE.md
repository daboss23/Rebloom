@AGENTS.md

# Design work

Design skills live in `.claude/skills` and load in every session. For any UI work (dashboard, intake, report, landing page), use them as follows.

1. **The brand wins.** `BRIEF.md` section 7 and the mockup in `/reference` set the look: porcelain, ink and one champagne accent; Cormorant Garamond for display, Inter for body and UI; sharp corners and hairline borders; no gradients, glass or heavy shadows; slow fades, nothing bouncy. Where a skill's defaults disagree (banning Inter, pill badges, glows, springy motion), follow the brief.
2. **Before building or restyling UI,** load `impeccable` and `frontend-design`. For motion, also load `emil-design-eng`; for a calm, editorial surface, `minimalist-ui`.
3. **After building,** review with `frontend-design-audit`. For flows a client moves through (intake, the report gate, booking), also use `ux-product-auditor`. If motion changed, use `review-animations`.
4. **Reference sites from Joshua:** `extract-design-system`. **Landing page:** `landing-page-cro-expert` and `design-taste-frontend`. **Choosing a library:** `pick-ui-library`.
5. Don't turn on impeccable's edit hook (`/impeccable hooks on`) without asking: it writes to the project's Claude settings.
