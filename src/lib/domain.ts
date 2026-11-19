// Pure domain logic: no I/O, no clock reads. Everything takes `now` explicitly.

export const STAGES = ["Booked", "Diagnosed", "Parts", "Scheduled", "Completed"] as const;
export type Stage = (typeof STAGES)[number];

export const TECHS = [
  { id: "tech-a", name: "Tech A" },
  { id: "tech-b", name: "Tech B" },
] as const;
export type TechId = (typeof TECHS)[number]["id"];
export const isTechId = (v: unknown): v is TechId => TECHS.some((t) => t.id === v);

export const ACTORS = ["agent", "coordinator", "tech"] as const;
export type Actor = (typeof ACTORS)[number];

// ---- Stage transitions (fixed table) ----
export const TRANSITIONS: Record<Stage, readonly Stage[]> = {
  Booked: ["Diagnosed"],
  Diagnosed: ["Parts", "Scheduled"],
  Parts: ["Scheduled"],
  Scheduled: ["Completed"],
  Completed: [],
};
export const canTransition = (from: Stage, to: Stage) => TRANSITIONS[from].includes(to);

export type TransitionContext = { hasVisit: boolean };
/** Returns null when allowed, otherwise the reason it is blocked. */
export function transitionBlock(from: Stage, to: Stage, ctx: TransitionContext): string | null {
  if (!canTransition(from, to)) return `Transition ${from} -> ${to} is not in the transition table.`;
  if (to === "Scheduled" && !ctx.hasVisit) return "Book a technician visit before moving to Scheduled.";
  return null;
}

// ---- Attention rules (fixed thresholds) ----
export type Flag = "PART DELAYED" | "SLA RISK" | "READY TO SCHEDULE";
export const SLA_WINDOW_HOURS = 24;
export const DATE_ONLY_ETA_HOUR_UTC = 17;

export const RULE_TEXT: Record<Flag, string> = {
  "PART DELAYED": "An ordered part's ETA is later than the scheduled visit start.",
  "SLA RISK": `Promised window ends within ${SLA_WINDOW_HOURS}h of now (or has passed) and the ticket is still before Scheduled.`,
  "READY TO SCHEDULE": "Stage is Diagnosed or Parts, diagnosis is done, no part is still on order, and no visit is booked.",
};

export type PartRow = { id: string; name: string; status: "ordered" | "on_hand"; eta: string | null };
export type RuleInput = {
  stage: Stage;
  diagnosed: boolean;
  promisedBy: string;
  parts: PartRow[];
  visit: { start: string } | null;
};
export type FlagResult = { flag: Flag; rule: string; detail: string };

const ms = (s: string) => Date.parse(s);

export function attentionFlags(k: RuleInput, nowMs: number): FlagResult[] {
  const out: FlagResult[] = [];
  const open = k.parts.filter((p) => p.status === "ordered" && p.eta);
  if (k.visit && k.stage !== "Completed") {
    const late = open.filter((p) => ms(p.eta as string) > ms(k.visit!.start));
    if (late.length) {
      out.push({
        flag: "PART DELAYED",
        rule: RULE_TEXT["PART DELAYED"],
        detail: late.map((p) => `${p.name} ETA ${p.eta} > visit ${k.visit!.start}`).join("; "),
      });
    }
  }
  const behind = k.stage === "Booked" || k.stage === "Diagnosed" || k.stage === "Parts";
  const hoursLeft = (ms(k.promisedBy) - nowMs) / 3600_000;
  if (behind && hoursLeft <= SLA_WINDOW_HOURS) {
    out.push({
      flag: "SLA RISK",
      rule: RULE_TEXT["SLA RISK"],
      detail: `${hoursLeft.toFixed(1)}h to promised window end (${k.promisedBy}); stage ${k.stage}`,
    });
  }
  const stillOrdered = k.parts.some((p) => p.status === "ordered");
  if ((k.stage === "Diagnosed" || k.stage === "Parts") && k.diagnosed && !k.visit && !stillOrdered) {
    out.push({
      flag: "READY TO SCHEDULE",
      rule: RULE_TEXT["READY TO SCHEDULE"],
      detail: k.parts.length ? "All parts on hand; no visit booked" : "No part needed; no visit booked",
    });
  }
  return out;
}

// ---- Pre-ID stand-in: fixed sample lookup, not a model ----
export type Category = "washer" | "fridge" | "oven";
export const CATEGORIES: Category[] = ["washer", "fridge", "oven"];

export const PARTS_TABLE: readonly { category: Category; symptom: string; parts: readonly string[] }[] = [
  { category: "washer", symptom: "won't drain", parts: ["Drain pump", "Drain hose"] },
  { category: "washer", symptom: "won't start", parts: ["Lid switch", "Main control board"] },
  { category: "washer", symptom: "violent shaking", parts: ["Suspension rods", "Shock pads"] },
  { category: "washer", symptom: "door seal leak", parts: ["Door boot seal", "Drain hose clamp"] },
  { category: "washer", symptom: "won't spin", parts: ["Motor coupling", "Drive belt"] },
  { category: "fridge", symptom: "not cooling", parts: ["Evaporator fan motor", "Defrost heater", "Start relay"] },
  { category: "fridge", symptom: "ice buildup", parts: ["Defrost heater", "Defrost thermostat", "Evaporator fan motor"] },
  { category: "fridge", symptom: "loud fan", parts: ["Evaporator fan motor", "Condenser fan motor"] },
  { category: "fridge", symptom: "slow water dispenser", parts: ["Water inlet valve", "Water filter"] },
  { category: "oven", symptom: "bake element not heating", parts: ["Bake element", "Temperature sensor"] },
  { category: "oven", symptom: "igniter glows, no flame", parts: ["Igniter", "Gas safety valve"] },
  { category: "oven", symptom: "door won't latch", parts: ["Latch assembly", "Door switch"] },
  { category: "oven", symptom: "won't heat", parts: ["Bake element", "Temperature sensor", "Control board"] },
];

export type Suggestion = { rank: number; part: string; rule: string };
export function suggestParts(category: string, symptom: string): Suggestion[] {
  const norm = (s: string) => s.trim().toLowerCase();
  const row = PARTS_TABLE.find((r) => r.category === norm(category) && norm(r.symptom) === norm(symptom));
  if (!row) return [];
  return row.parts.map((part, i) => ({ rank: i + 1, part, rule: `position ${i + 1} of ${row.parts.length} in the sample table row` }));
}

// ---- Scheduling ----
export const MAX_VISIT_HOURS = 8;
export type Interval = { start: string; end: string };
/** Half-open interval overlap: back-to-back visits are allowed. */
export const overlaps = (a: Interval, b: Interval) => ms(a.start) < ms(b.end) && ms(b.start) < ms(a.end);

// ---- Input validation ----
const ISO_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/;
/** Parses ISO date or datetime to a UTC ISO string. Date-only means 17:00 UTC. Missing zone means UTC. */
export function parseIso(v: unknown): string | null {
  if (typeof v !== "string" || !ISO_RE.test(v)) return null;
  let s = v;
  if (s.length === 10) s += `T${String(DATE_ONLY_ETA_HOUR_UTC).padStart(2, "0")}:00:00Z`;
  else if (!/(Z|[+-]\d{2}:\d{2})$/.test(s)) s += "Z";
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}
