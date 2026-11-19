import { and, asc, eq, gt, sql } from "drizzle-orm";
import type { Db } from "@/db";
import type { tickets, visits } from "@/db/schema";
import {
  ACTORS, Actor, attentionFlags, isTechId, MAX_VISIT_HOURS, overlaps, parseIso, Stage, STAGES,
  suggestParts, TECHS, TRANSITIONS, transitionBlock, PartRow, SLA_WINDOW_HOURS, RULE_TEXT,
} from "./domain";
import { seedOwner } from "./seed";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const WRITE_LIMIT_PER_HOUR = 120;
export const MAX_BODY_BYTES = 20 * 1024;

type Ticket = typeof tickets.$inferSelect;
type Visit = typeof visits.$inferSelect;
const first = <T>(rows: T[]): T | undefined => rows[0];

export async function ensureOwner(c: Db, owner: string, nowMs: number) {
  const { tickets } = c.t;
  const has = await c.orm.select({ id: tickets.id }).from(tickets).where(eq(tickets.owner, owner)).limit(1);
  if (has.length) return;
  await c.tx(async (t) => {
    // Postgres: serialize concurrent first-visits for the same owner, then re-check.
    if (t.kind === "postgres") {
      await (t.orm as unknown as { execute(q: unknown): Promise<unknown> }).execute(sql`select pg_advisory_xact_lock(hashtext(${owner}))`);
      if ((await t.orm.select({ id: tickets.id }).from(tickets).where(eq(tickets.owner, owner)).limit(1)).length) return;
    }
    await seedOwner(t, owner, nowMs);
  });
}

export async function resetOwner(c: Db, owner: string, nowMs: number) {
  await c.tx(async (t) => {
    for (const tb of [t.t.tickets, t.t.parts, t.t.visits, t.t.events]) await t.orm.delete(tb).where(eq(tb.owner, owner));
    await seedOwner(t, owner, nowMs);
  });
}

/** Counts a write against the owner's rolling hour; throws 429 when over the limit. */
export async function consumeWrite(c: Db, owner: string, nowMs: number) {
  const { writeLog } = c.t;
  const since = nowMs - 3600_000;
  const [row] = await c.orm.select({ n: sql<number>`count(*)` }).from(writeLog).where(and(eq(writeLog.owner, owner), gt(writeLog.at, since)));
  if (Number(row.n) >= WRITE_LIMIT_PER_HOUR) throw new HttpError(429, `Rate limit: ${WRITE_LIMIT_PER_HOUR} writes per hour per owner.`);
  await c.orm.insert(writeLog).values({ owner, at: nowMs });
  await c.orm.delete(writeLog).where(and(eq(writeLog.owner, owner), sql`${writeLog.at} <= ${since}`));
}

async function loadTicket(c: Db, owner: string, id: string): Promise<Ticket> {
  const { tickets } = c.t;
  const t = first(await c.orm.select().from(tickets).where(and(eq(tickets.owner, owner), eq(tickets.id, id))).limit(1));
  if (!t) throw new HttpError(404, "Ticket not found.");
  return t;
}
const visitOf = async (c: Db, owner: string, id: string) => {
  const { visits } = c.t;
  return first(await c.orm.select().from(visits).where(and(eq(visits.owner, owner), eq(visits.ticketId, id))).limit(1)) ?? null;
};
const partsOf = async (c: Db, owner: string, id: string): Promise<PartRow[]> => {
  const { parts } = c.t;
  return (await c.orm.select().from(parts).where(and(eq(parts.owner, owner), eq(parts.ticketId, id))).orderBy(asc(parts.id)))
    .map((p) => ({ id: p.id, name: p.name, status: p.status as PartRow["status"], eta: p.eta }));
};

async function addEvent(c: Db, owner: string, ticketId: string, nowMs: number, actor: Actor, kind: string, text: string) {
  await c.orm.insert(c.t.events).values({ owner, ticketId, at: new Date(nowMs).toISOString(), actor, kind, text });
}

function shape(t: Ticket, ps: PartRow[], v: Visit | null, nowMs: number) {
  const flags = attentionFlags({ stage: t.stage as Stage, diagnosed: t.diagnosed, promisedBy: t.promisedBy, parts: ps, visit: v }, nowMs);
  return {
    id: t.id, customer: t.customer, synthetic: true, category: t.category, appliance: t.appliance, issue: t.issue, symptom: t.symptom,
    stage: t.stage as Stage, promisedBy: t.promisedBy, diagnosed: t.diagnosed, tech: t.tech,
    parts: ps, visit: v ? { tech: v.tech, start: v.start, end: v.end } : null, flags,
  };
}

export async function board(c: Db, owner: string, nowMs: number) {
  const { tickets, parts, visits } = c.t;
  const ts = await c.orm.select().from(tickets).where(eq(tickets.owner, owner)).orderBy(asc(tickets.id));
  const allParts = await c.orm.select().from(parts).where(eq(parts.owner, owner));
  const allVisits = await c.orm.select().from(visits).where(eq(visits.owner, owner));
  return {
    now: new Date(nowMs).toISOString(),
    stages: STAGES,
    techs: TECHS,
    thresholds: { slaWindowHours: SLA_WINDOW_HOURS, rules: RULE_TEXT },
    tickets: ts.map((t) => shape(t,
      allParts.filter((p) => p.ticketId === t.id).map((p) => ({ id: p.id, name: p.name, status: p.status as PartRow["status"], eta: p.eta })),
      allVisits.find((v) => v.ticketId === t.id) ?? null, nowMs)),
  };
}

export async function ticketDetail(c: Db, owner: string, id: string, nowMs: number) {
  const t = await loadTicket(c, owner, id);
  const v = await visitOf(c, owner, id);
  const base = shape(t, await partsOf(c, owner, id), v, nowMs);
  const { events } = c.t;
  const timeline = (await c.orm.select().from(events).where(and(eq(events.owner, owner), eq(events.ticketId, id))).orderBy(asc(events.at), asc(events.id)))
    .map((e) => ({ at: e.at, actor: e.actor, kind: e.kind, text: e.text }));
  const nextStages = TRANSITIONS[base.stage].map((to) => ({ to, blocked: transitionBlock(base.stage, to, { hasVisit: !!v }) }));
  const open = base.stage !== "Completed";
  return {
    ...base,
    timeline,
    nextStages,
    actions: { assign: open, schedule: open && base.stage !== "Booked", orderPart: open && base.stage !== "Booked", receivePart: open },
    suggestions: base.stage === "Completed" ? [] : suggestParts(t.category, t.symptom),
    suggestionsLabel: "Fixed sample lookup, not a model. Ranked by position in the table row.",
  };
}

function actorOf(v: unknown, fallback: Actor): Actor {
  if (v === undefined) return fallback;
  if (typeof v === "string" && (ACTORS as readonly string[]).includes(v)) return v as Actor;
  throw new HttpError(400, `actor must be one of ${ACTORS.join(", ")}.`);
}
const techName = (id: string) => TECHS.find((t) => t.id === id)?.name ?? id;
type Body = Record<string, unknown>;

export async function advance(c: Db, owner: string, id: string, body: Body, nowMs: number) {
  const t = await loadTicket(c, owner, id);
  const to = body.to;
  if (typeof to !== "string" || !(STAGES as readonly string[]).includes(to)) throw new HttpError(400, `to must be one of ${STAGES.join(", ")}.`);
  const actor = actorOf(body.actor, to === "Completed" ? "tech" : "coordinator");
  const from = t.stage as Stage;
  const v = await visitOf(c, owner, id);
  const block = transitionBlock(from, to as Stage, { hasVisit: !!v });
  if (block) throw new HttpError(409, block);
  const { tickets } = c.t;
  await c.tx(async (tx) => {
    await tx.orm.update(tickets).set({ stage: to, ...(from === "Booked" ? { diagnosed: true } : {}) }).where(and(eq(tickets.owner, owner), eq(tickets.id, id)));
    await addEvent(tx, owner, id, nowMs, actor, "stage", `Stage ${from} -> ${to}.`);
  });
  return ticketDetail(c, owner, id, nowMs);
}

async function conflictFor(c: Db, owner: string, ticketId: string, tech: string, iv: { start: string; end: string }) {
  const { visits } = c.t;
  return (await c.orm.select().from(visits).where(and(eq(visits.owner, owner), eq(visits.tech, tech))))
    .find((o) => o.ticketId !== ticketId && overlaps(iv, o));
}

export async function assign(c: Db, owner: string, id: string, body: Body, nowMs: number) {
  const t = await loadTicket(c, owner, id);
  if (t.stage === "Completed") throw new HttpError(409, "Ticket is Completed.");
  if (!isTechId(body.tech)) throw new HttpError(400, `tech must be one of ${TECHS.map((x) => x.id).join(", ")}.`);
  const tech = body.tech;
  const actor = actorOf(body.actor, "coordinator");
  const { tickets, visits } = c.t;
  await c.tx(async (tx) => {
    const v = await visitOf(tx, owner, id);
    if (v) {
      const k = await conflictFor(tx, owner, id, tech, v);
      if (k) throw new HttpError(409, `${techName(tech)} is already booked ${k.start} to ${k.end} (${k.ticketId}).`);
      await tx.orm.update(visits).set({ tech }).where(and(eq(visits.owner, owner), eq(visits.ticketId, id)));
    }
    await tx.orm.update(tickets).set({ tech }).where(and(eq(tickets.owner, owner), eq(tickets.id, id)));
    await addEvent(tx, owner, id, nowMs, actor, "assign", `${techName(tech)} assigned${v ? " (visit moved to this technician)" : ""}.`);
  });
  return ticketDetail(c, owner, id, nowMs);
}

export async function schedule(c: Db, owner: string, id: string, body: Body, nowMs: number) {
  const t = await loadTicket(c, owner, id);
  if (t.stage === "Booked" || t.stage === "Completed") throw new HttpError(409, `Cannot schedule a visit while ticket is ${t.stage}.`);
  const tech = body.tech ?? t.tech;
  if (!isTechId(tech)) throw new HttpError(400, `tech must be one of ${TECHS.map((x) => x.id).join(", ")}.`);
  const start = parseIso(body.start), end = parseIso(body.end);
  if (!start || !end) throw new HttpError(400, "start and end must be ISO 8601 dates/datetimes.");
  const dur = (Date.parse(end) - Date.parse(start)) / 3600_000;
  if (dur <= 0 || dur > MAX_VISIT_HOURS) throw new HttpError(400, `Visit must end after it starts and last at most ${MAX_VISIT_HOURS}h.`);
  const actor = actorOf(body.actor, "coordinator");
  const { tickets, visits } = c.t;
  await c.tx(async (tx) => {
    const k = await conflictFor(tx, owner, id, tech, { start, end });
    if (k) throw new HttpError(409, `${techName(tech)} is already booked ${k.start} to ${k.end} (${k.ticketId}).`);
    const prev = await visitOf(tx, owner, id);
    if (prev) await tx.orm.update(visits).set({ tech, start, end }).where(and(eq(visits.owner, owner), eq(visits.ticketId, id)));
    else await tx.orm.insert(visits).values({ owner, ticketId: id, tech, start, end });
    await tx.orm.update(tickets).set({ tech }).where(and(eq(tickets.owner, owner), eq(tickets.id, id)));
    await addEvent(tx, owner, id, nowMs, actor, "schedule",
      `${prev ? "Visit rescheduled" : "Visit booked"}: ${techName(tech)} ${start} to ${end}${prev ? ` (was ${prev.start})` : ""}.`);
  });
  return ticketDetail(c, owner, id, nowMs);
}

export async function orderPart(c: Db, owner: string, id: string, body: Body, nowMs: number) {
  const t = await loadTicket(c, owner, id);
  if (t.stage === "Booked" || t.stage === "Completed") throw new HttpError(409, `Cannot order parts while ticket is ${t.stage}.`);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < 1 || name.length > 80) throw new HttpError(400, "name must be 1-80 characters.");
  const eta = parseIso(body.eta);
  if (!eta) throw new HttpError(400, "eta must be an ISO 8601 date or datetime.");
  const actor = actorOf(body.actor, "coordinator");
  const { parts } = c.t;
  const n = (await c.orm.select().from(parts).where(and(eq(parts.owner, owner), eq(parts.ticketId, id)))).length;
  await c.tx(async (tx) => {
    await tx.orm.insert(parts).values({ id: `${owner}:${id}:${Date.now().toString(36)}${n}`, owner, ticketId: id, name, status: "ordered", eta });
    await addEvent(tx, owner, id, nowMs, actor, "part", `Part ordered: ${name}, ETA ${eta}.`);
  });
  return ticketDetail(c, owner, id, nowMs);
}

export async function receivePart(c: Db, owner: string, id: string, partId: string, body: Body, nowMs: number) {
  await loadTicket(c, owner, id);
  const { parts } = c.t;
  const p = first(await c.orm.select().from(parts).where(and(eq(parts.owner, owner), eq(parts.ticketId, id), eq(parts.id, partId))).limit(1));
  if (!p) throw new HttpError(404, "Part not found.");
  if (p.status === "on_hand") throw new HttpError(409, "Part is already marked received.");
  const actor = actorOf(body.actor, "coordinator");
  await c.tx(async (tx) => {
    await tx.orm.update(parts).set({ status: "on_hand" }).where(eq(parts.id, partId));
    await addEvent(tx, owner, id, nowMs, actor, "part", `Part received: ${p.name}.`);
  });
  return ticketDetail(c, owner, id, nowMs);
}

export async function daySchedule(c: Db, owner: string, date: string, nowMs: number) {
  const start = parseIso(date.length === 10 ? `${date}T00:00:00Z` : "");
  if (!start) throw new HttpError(400, "date must be YYYY-MM-DD.");
  const end = new Date(Date.parse(start) + 24 * 3600_000).toISOString();
  const { tickets, visits } = c.t;
  const vs = (await c.orm.select().from(visits).where(eq(visits.owner, owner)))
    .filter((v) => v.start < end && v.end > start);
  const ts = await c.orm.select().from(tickets).where(eq(tickets.owner, owner));
  return {
    date, now: new Date(nowMs).toISOString(),
    techs: TECHS.map((te) => ({
      ...te,
      visits: vs.filter((v) => v.tech === te.id).sort((a, b) => a.start.localeCompare(b.start)).map((v) => {
        const t = ts.find((x) => x.id === v.ticketId);
        return { ticketId: v.ticketId, customer: t?.customer ?? "", appliance: t?.appliance ?? "", stage: t?.stage ?? "", start: v.start, end: v.end };
      }),
    })),
  };
}
