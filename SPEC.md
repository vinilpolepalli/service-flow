# Service Flow — SPEC

Independent demo inspired by the problem space of Bernard (YC S26). Not affiliated.

## Goal
Operations board for fictional "Demo Appliance Co": repair tickets flow through agent-coordinated stages, with deterministic attention flags, per-ticket handoff timelines, and a technician day schedule.

## Honesty requirements
- Header badge: "Sample data - demo".
- Copy states all tickets/customers are synthetic and rules are fixed-threshold illustrations.
- Footer: "Independent demo built by Vinil Polepalli. Not affiliated with or endorsed by Bernard."

## Features
1. **Board**: 9 synthetic tickets in columns Booked → Diagnosed → Parts → Scheduled → Completed (washers, fridges, ovens).
2. **Attention rules** (pure functions, fixed "now" = 2026-03-10 09:00, thresholds shown in UI):
   - PART DELAYED: part ETA is after the scheduled visit start.
   - SLA RISK: promised window ends within 24h of now and stage is before Scheduled (not Completed).
   - READY TO SCHEDULE: stage Diagnosed/Parts, diagnosis done, part status "on hand" (or none needed), no visit scheduled.
3. **Ticket detail**: click a card → panel with handoff timeline (stage, timestamp, actor "agent", text) for each stage reached.
4. **Schedule panel**: day view for 2 technicians (Tech A, Tech B) with visits linked to tickets.
5. Filter by flag (optional small chips).

## UI
Dark, sleek. Accent clearly ORANGE (#FF6A1A family; not amber/yellow). No indigo/emerald/etc. accents.

## Tech
Next.js (App Router) + TypeScript, `output: 'export'`, `npm run build` must pass. No runtime external calls (no remote fonts/APIs). No git commit, no deploy.

## Layout
- `src/data/tickets.ts` — types + synthetic data
- `src/lib/rules.ts` — rules + thresholds
- `src/components/` — Board, TicketCard, TicketDetail, SchedulePanel
- `src/app/{layout,page}.tsx`, `globals.css`
