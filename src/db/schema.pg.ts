import { pgTable, text, integer, bigint, boolean, index, primaryKey } from "drizzle-orm/pg-core";

// Postgres twin of schema.ts: identical table/column names so the service layer is shared.
export const tickets = pgTable("tickets", {
  id: text("id").notNull(),
  owner: text("owner").notNull(),
  customer: text("customer").notNull(),
  category: text("category").notNull(),
  appliance: text("appliance").notNull(),
  issue: text("issue").notNull(),
  symptom: text("symptom").notNull(),
  stage: text("stage").notNull(),
  promisedBy: text("promised_by").notNull(),
  diagnosed: boolean("diagnosed").notNull().default(false),
  tech: text("tech"),
}, (t) => [primaryKey({ columns: [t.owner, t.id] }), index("tickets_owner_idx").on(t.owner, t.id)]);

export const parts = pgTable("parts", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull(),
  ticketId: text("ticket_id").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull(),
  eta: text("eta"),
});

export const visits = pgTable("visits", {
  owner: text("owner").notNull(),
  ticketId: text("ticket_id").notNull(),
  tech: text("tech").notNull(),
  start: text("start").notNull(),
  end: text("end").notNull(),
}, (t) => [primaryKey({ columns: [t.owner, t.ticketId] }), index("visits_owner_tech_idx").on(t.owner, t.tech, t.start)]);

export const events = pgTable("events", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  owner: text("owner").notNull(),
  ticketId: text("ticket_id").notNull(),
  at: text("at").notNull(),
  actor: text("actor").notNull(),
  kind: text("kind").notNull(),
  text: text("text").notNull(),
}, (t) => [index("events_ticket_idx").on(t.owner, t.ticketId)]);

export const writeLog = pgTable("write_log", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  owner: text("owner").notNull(),
  at: bigint("at", { mode: "number" }).notNull(), // epoch ms overflows int4
}, (t) => [index("write_log_idx").on(t.owner, t.at)]);
