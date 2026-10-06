@AGENTS.md

# Design work

Design skills live in `.claude/skills` and load in every session. For any UI work (dashboard, intake, report, landing page), use them as follows.

1. **The brand wins.** Joshua chose one look for the whole product (`DECISIONS.md` D-058, D-059, D-061): light through water, frosted glass with depth, deep sea, gold for money and the main action, green for growth, a bloom mark for renewal; Cormorant Garamond for display, Inter for body and UI. It must feel alive. Client pages (`/c`, `/r`) wear it under the clinic's own name, logo and accent, with Rebloom only as the small line in the footer (D-001). Where a skill's defaults disagree (banning Inter or Cormorant, glass, gold, lively motion), follow this. The brief's porcelain look (`BRIEF.md` 7.1 to 7.6 and the `/reference` mockup) is retired; its voice and copy rules (7.7) still apply everywhere.
2. **Before building or restyling UI,** load `impeccable` and `frontend-design`. For motion, also load `emil-design-eng`; for a calm, editorial surface, `minimalist-ui`.
3. **After building,** review with `frontend-design-audit`. For flows a client moves through (intake, the report gate, booking), also use `ux-product-auditor`. If motion changed, use `review-animations`.
4. **Reference sites from Joshua:** `extract-design-system`. **Landing page:** `landing-page-cro-expert` and `design-taste-frontend`. **Choosing a library:** `pick-ui-library`.
5. Don't turn on impeccable's edit hook (`/impeccable hooks on`) without asking: it writes to the project's Claude settings.
