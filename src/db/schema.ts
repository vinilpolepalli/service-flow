import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const tickets = sqliteTable("tickets", {
  id: text("id").notNull(),
  owner: text("owner").notNull(),
  customer: text("customer").notNull(),
  category: text("category").notNull(),
  appliance: text("appliance").notNull(),
  issue: text("issue").notNull(),
  symptom: text("symptom").notNull(),
  stage: text("stage").notNull(),
  promisedBy: text("promised_by").notNull(),
  diagnosed: integer("diagnosed", { mode: "boolean" }).notNull().default(false),
  tech: text("tech"),
}, (t) => [index("tickets_owner_idx").on(t.owner, t.id)]);

export const parts = sqliteTable("parts", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull(),
  ticketId: text("ticket_id").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull(),
  eta: text("eta"),
});

export const visits = sqliteTable("visits", {
  owner: text("owner").notNull(),
  ticketId: text("ticket_id").notNull(),
  tech: text("tech").notNull(),
  start: text("start").notNull(),
  end: text("end").notNull(),
}, (t) => [index("visits_owner_tech_idx").on(t.owner, t.tech, t.start)]);

export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  owner: text("owner").notNull(),
  ticketId: text("ticket_id").notNull(),
  at: text("at").notNull(),
  actor: text("actor").notNull(),
  kind: text("kind").notNull(),
  text: text("text").notNull(),
}, (t) => [index("events_ticket_idx").on(t.owner, t.ticketId)]);

export const writeLog = sqliteTable("write_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  owner: text("owner").notNull(),
  at: integer("at").notNull(),
}, (t) => [index("write_log_idx").on(t.owner, t.at)]);
