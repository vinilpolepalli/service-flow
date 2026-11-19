# Service Flow v2

Independent demo of an appliance-service operations board, inspired by the problem space of Bernard (bernardhq.com). Fictional "Demo Appliance Co"; every ticket and customer is SYNTHETIC.

Tickets move Booked -> Diagnosed -> Parts -> Scheduled -> Completed. Every stage change, part order and schedule change is a persisted, timestamped, actor-labeled event. Attention rules recompute from stored state and the server clock on every read.

## Run

```
npm install
npm run build && npm start      # http://localhost:3000
npm run dev                     # development
npm test                        # unit tests (vitest)
```

Data is stored in `serviceflow.db` (SQLite via Drizzle ORM). Override with `SF_DB_PATH`. Each visitor gets an httpOnly `sf_uid` cookie and their own 10 seeded tickets; "Reset demo data" reseeds them.

## What is real and what is a stand-in

- Rules (fixed thresholds, shown in the UI): PART DELAYED, SLA RISK (24h), READY TO SCHEDULE.
- The Pre-ID panel is a fixed sample symptom-to-parts lookup table, ranked by table position. It is not a model and not AI.
- No external services, no API keys, no randomness in logic.

Not implemented: Postgres via `DATABASE_URL`. Only the SQLite path exists; see IMPLEMENTATION.md.

Independent demo built by Vinil Polepalli. Synthetic data and fixed-threshold rules only. Not affiliated with or endorsed by Bernard.
