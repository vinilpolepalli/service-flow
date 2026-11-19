# Implementation notes

## Layout
- `src/lib/domain.ts` pure logic: stages, transition table, attention rules, parts table, interval overlap, ISO parsing.
- `src/lib/service.ts` DB-backed actions (take a `Db`, owner and `now`); `HttpError` carries the status code.
- `src/lib/seed.ts` 10 synthetic tickets per owner, times relative to the seeding moment / UTC day.
- `src/lib/api.ts` route wrapper: owner cookie, seeding, 20KB body cap (413), write rate limit (429), error mapping.
- `src/db/` Drizzle schema + SQLite bootstrap (`CREATE TABLE IF NOT EXISTS`, WAL).
- `src/components/` App (board data + actions), Board, TicketDrawer, SchedulePanel.

## Data model (SQLite)
- `tickets(owner, id, customer, category, appliance, issue, symptom, stage, promised_by, diagnosed, tech)` PK (owner, id)
- `parts(id, owner, ticket_id, name, status ordered|on_hand, eta)`
- `visits(owner, ticket_id, tech, start, end)` one visit per ticket
- `events(id, owner, ticket_id, at, actor agent|coordinator|tech, kind, text)` append-only timeline
- `write_log(owner, at)` rolling-hour write counter

## Endpoints (all owner-scoped via `sf_uid`)
- `GET /api/board`, `GET /api/tickets/:id`, `GET /api/schedule?date=YYYY-MM-DD`
- `POST /api/tickets/:id/advance {to}`; `/assign {tech}`; `/schedule {tech,start,end}`; `/parts {name,eta}`; `/parts/:pid/receive`
- `POST /api/reset`
- Status codes: 400 validation, 404 unknown or other owner's ticket, 409 disallowed transition or double booking, 413 body over 20KB, 429 over 120 writes/hour.

## Rules and behaviour choices
- Transitions: Booked->Diagnosed; Diagnosed->Parts|Scheduled; Parts->Scheduled; Scheduled->Completed. Scheduled requires a booked visit.
- Advancing out of Booked marks the ticket diagnosed (the stand-in for a completed diagnosis).
- Double booking = overlapping half-open intervals for the same technician (back-to-back is allowed). Checked inside a transaction.
- Date-only ETAs are 17:00 UTC; datetimes without a zone are UTC. Visits are capped at 8h.
- Every write attempt counts toward the rate limit, including ones rejected with 409/400 (after the body-size check).
- Cross-owner access returns 404 (ticket ids repeat per owner, so another owner's data is simply not addressable).
- The `actor` field in request bodies is a self-declared label, not authentication.

## Known gaps
- Postgres/`DATABASE_URL` is not implemented or tested; the schema is `sqlite-core` only.
- The owner cookie is an unsigned random UUID, which is adequate for a synthetic-data demo only.
- The unslop scan reports one medium finding (the pill class), which is the spec-mandated status chip.

## Verification results (run against `npm start` on a production build)
- `npm run build` passes; `npm test`: 20 tests pass (transition table, rule thresholds including exactly-24h, parts lookup, double-booking 409, cross-owner 404, rate limit).
- End-to-end over HTTP with curl:
  - T-1001 Booked->Diagnosed->Parts: both timeline events appended; Booked->Scheduled skip returned 409; READY TO SCHEDULE appeared after reaching Parts.
  - Scheduled T-1003 for Tech A, then ordered "Thermostat" with ETA 5 days after the visit: PART DELAYED fired with the exact ETA/visit detail; it stayed after advancing to Scheduled.
  - Second booking for Tech A overlapping T-1003: 409; same slot for Tech B: 200.
  - A second cookie jar saw its own untouched T-1003 (no visit, own parts). Unknown ticket 404. Invalid ETA 400. 25KB body 413.
  - Rate limit: after 120 writes in the hour, further writes returned 429 (111 x 409 and 19 x 429 in the burst, after earlier writes).
  - Restart: the server was restarted on the same db file; ticket stage, visit, parts, flags and 7 events persisted, and the rate limit still applied.
  - UI threshold text (24h, ETA after visit start, no part on order / no visit) matches `RULE_TEXT` and `SLA_WINDOW_HOURS` in `domain.ts`, which the rules read.
- Screenshots from the running app: `/tmp/sf2-board.png`, `/tmp/sf2-ticket.png`, `/tmp/sf2-schedule.png`, `/tmp/sf2-mobile.png` (390px).
- `python3 ~/unslop/devibe_scan.py .`: 0 high, 1 medium (pill), no unslop-ignore comments.
