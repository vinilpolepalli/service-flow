# Service Flow v2 - high-fidelity rebuild spec

Rebuild this static demo into a real working product with a live backend. Maps to Bernard (bernardhq.com, YC S26): AI employees for appliance servicers carrying each job from first call through booking, diagnosis (Pre-ID), parts preparation, technician handoff, and follow-up. Service Flow demonstrates the operations core: a live ticket board where every stage transition, part order and schedule change is a persisted event, deterministic attention rules recompute from actual state, and a transparent parts-suggestion table stands in (honestly labeled) for Pre-ID.

Do not deploy, do not git commit, do not push. No paid services, no API keys, no randomness in logic (ids/timestamps aside).

## Architecture
- Next.js App Router + TypeScript + Tailwind, SERVER runtime (remove output:'export').
- Drizzle ORM: SQLite (serviceflow.db) dev; Postgres via DATABASE_URL prod.
- ~10 synthetic tickets for the fictional "Demo Appliance Co" seeded per owner, labeled SYNTHETIC everywhere. Stages: Booked -> Diagnosed -> Parts -> Scheduled -> Completed.

## Product workflow (fitted to THIS product)
1. Home = the board: tickets grouped by stage with attention flags, first action above the fold on mobile.
2. Ticket detail: full handoff timeline (every event timestamped, actor-labeled: agent/coordinator/tech), current state, attention flags with the exact rule that fired, and the next allowed actions for the stage.
3. Real state-changing actions via API: advance stage (validates allowed transitions, appends timeline event), assign technician, schedule/reschedule visit (updates the day schedule), order part with ETA, mark part received. Every action persists and recomputes flags.
4. Deterministic attention rules with visible fixed thresholds: PART DELAYED (part ETA past scheduled visit), SLA RISK (promised window within 24h but stage behind schedule-readiness), READY TO SCHEDULE (diagnosed + part on hand + no visit booked). Rules recompute from state + server clock; thresholds stated in the UI.
5. Pre-ID stand-in (honest): a deterministic symptom-to-parts lookup table (sample mapping, e.g. "washer + won't drain" -> drain pump, hose) shown on diagnosis with the label "fixed sample lookup, not a model". Ranked by a stated rule (position in the table), never called AI.
6. Day schedule panel for 2 fictional technicians driven by actual scheduled visits in the DB; double-booking a time slot is rejected with 409.

## Truthfulness bar
- SYNTHETIC labels on tickets/customers; rules labeled fixed-threshold illustrations; parts lookup labeled a fixed sample table, not a model or AI.
- Footer: "Independent demo built by Vinil Polepalli. Synthetic data and fixed-threshold rules only. Not affiliated with or endorsed by Bernard."

## Abuse and isolation controls
- Owner cookie (sf_uid, httpOnly); tickets/schedule owner-scoped; cross-owner 403/404.
- Rate limits: 120 writes/hour/owner, 413 at 20KB; inputs validated (stage transitions against a fixed transition table, ETAs ISO dates, tech ids from the seeded pair).

## UI bar
- Light theme, near-white ground, hairlines, small-caps labels, tabular nums, system stack; mono for timestamps/ETAs where it aids scanning.
- Brand accent: dispatch blue #1d4ed8 (hover #1e40af). Deliberate: a brighter, saturated utility blue for an operations board, clearly distinct from the sibling muted dark navy #16324f and from every other sibling accent (teal/bronze/crimson/burnt-orange/olive/green); not the indigo/violet band. Comment the rationale in tailwind.config.ts.
- Pills only for status chips; buttons 8px, cards 10px, inputs 8px; no gradients, no emoji icons, no hero+3-cards, no amber-50 fills.
- Layout fitted to a dispatch board (stage columns + ticket drawer + schedule strip), not a clone of sibling demos. Mobile: stages stack, board scrolls vertically.

## Definition of done
- npm run build + npm test pass (transition table, attention rules, parts lookup, double-booking rejection unit-tested).
- Real end-to-end: run server; advance a ticket through two stages via API and verify timeline events + flag recomputation; order a part with an ETA past the scheduled visit and verify PART DELAYED fires; schedule and double-book a tech slot and verify 409; verify rule thresholds match the stated UI text; persistence across restart; owner isolation; rate limit.
- python3 ~/unslop/devibe_scan.py . - zero high or justified unslop-ignore comments.
- README + IMPLEMENTATION.md (data model, endpoints, verification results).
- Screenshots to /tmp: sf2-board.png, sf2-ticket.png, sf2-schedule.png, sf2-mobile.png (390px) from the RUNNING app.
