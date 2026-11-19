import type { Db } from "@/db";
import type { Actor, Category, Stage, TechId } from "./domain";

const H = 3600_000;
const iso = (ms: number) => new Date(ms).toISOString();

type SeedPart = { name: string; status: "ordered" | "on_hand"; etaAtMs?: number };
type SeedTicket = {
  id: string; customer: string; category: Category; appliance: string; issue: string; symptom: string;
  stage: Stage; promisedInH: number; diagnosed: boolean; tech?: TechId; parts: SeedPart[];
  visit?: { dayOffset: number; hour: number; minutes: number; tech: TechId };
  log: [number, Actor, string, string][]; // [hours ago, actor, kind, text]
};

/** Seed 10 SYNTHETIC tickets for one owner. Times are relative to `nowMs` and to the UTC day start. */
export async function seedOwner(c: Db, owner: string, nowMs: number) {
  const day = new Date(nowMs); day.setUTCHours(0, 0, 0, 0);
  const D = day.getTime();
  const at = (dayOffset: number, hour: number, min = 0) => D + dayOffset * 24 * H + hour * H + min * 60_000;
  const book = (h: number): [number, Actor, string, string] => [h, "agent", "booked", "Booking confirmed with customer by text thread; arrival window promised."];

  const list: SeedTicket[] = [
    { id: "T-1001", customer: "Maria Okafor", category: "washer", appliance: "Washer (front-load)", issue: "Won't drain", symptom: "won't drain", stage: "Booked", promisedInH: 72, diagnosed: false, parts: [], log: [book(2)] },
    { id: "T-1002", customer: "Daniel Whitfield", category: "fridge", appliance: "Fridge (french door)", issue: "Warm fridge section", symptom: "not cooling", stage: "Booked", promisedInH: 6, diagnosed: false, parts: [],
      log: [book(17), [17, "agent", "intake", "Asked intake questions: model number, error codes, photos requested."]] },
    { id: "T-1003", customer: "Priya Raman", category: "oven", appliance: "Oven (electric range)", issue: "Bake element not heating", symptom: "bake element not heating", stage: "Diagnosed", promisedInH: 48, diagnosed: true,
      parts: [{ name: "Bake element", status: "on_hand" }],
      log: [book(50), [22, "agent", "diagnosis", "Diagnosis summary: open-circuit bake element (photo + resistance reading from customer)."], [22, "agent", "stage", "Stage Booked -> Diagnosed."], [22, "agent", "part", "Matched part to stock: Bake element on hand."]] },
    { id: "T-1004", customer: "Luis Herrera", category: "washer", appliance: "Washer (top-load)", issue: "Error code, won't start", symptom: "won't start", stage: "Diagnosed", promisedInH: 20, diagnosed: true, parts: [],
      log: [book(72), [18, "agent", "diagnosis", "Diagnosis summary: lid-switch fault cleared by reseating connector; no part needed."], [18, "agent", "stage", "Stage Booked -> Diagnosed."]] },
    { id: "T-1005", customer: "Hannah Brooks", category: "fridge", appliance: "Fridge (top-freezer)", issue: "Ice buildup, loud fan", symptom: "ice buildup", stage: "Parts", promisedInH: 120, diagnosed: true,
      parts: [{ name: "Evaporator fan motor", status: "ordered", etaAtMs: nowMs + 96 * H }],
      log: [book(96), [70, "agent", "diagnosis", "Diagnosis summary: failing evaporator fan motor."], [70, "agent", "stage", "Stage Booked -> Diagnosed."], [70, "agent", "part", "Part ordered: Evaporator fan motor."], [70, "agent", "stage", "Stage Diagnosed -> Parts."]] },
    { id: "T-1006", customer: "Omar Siddiqui", category: "oven", appliance: "Oven (gas range)", issue: "Igniter glows, no flame", symptom: "igniter glows, no flame", stage: "Scheduled", promisedInH: 80, diagnosed: true, tech: "tech-b",
      parts: [{ name: "Igniter", status: "ordered", etaAtMs: at(2, 14) }], visit: { dayOffset: 2, hour: 10, minutes: 90, tech: "tech-b" },
      log: [book(120), [100, "agent", "diagnosis", "Diagnosis summary: weak igniter, draws too little current."], [100, "agent", "part", "Part ordered: Igniter; supplier ETA later revised."], [90, "coordinator", "schedule", "Tech B booked for the visit."], [90, "coordinator", "stage", "Stage Parts -> Scheduled."]] },
    { id: "T-1007", customer: "Grace Lindqvist", category: "washer", appliance: "Washer (front-load)", issue: "Door seal leak", symptom: "door seal leak", stage: "Scheduled", promisedInH: 36, diagnosed: true, tech: "tech-b",
      parts: [{ name: "Door boot seal", status: "on_hand" }], visit: { dayOffset: 0, hour: 13, minutes: 90, tech: "tech-b" },
      log: [book(140), [110, "agent", "diagnosis", "Diagnosis summary: torn door boot seal."], [110, "agent", "part", "Part received from stock: Door boot seal."], [30, "coordinator", "schedule", "Tech B booked today 13:00 UTC; customer confirmed."], [30, "coordinator", "stage", "Stage Diagnosed -> Scheduled."]] },
    { id: "T-1008", customer: "Ethan Park", category: "fridge", appliance: "Fridge (side-by-side)", issue: "Water dispenser slow", symptom: "slow water dispenser", stage: "Completed", promisedInH: -2, diagnosed: true, tech: "tech-a",
      parts: [{ name: "Water inlet valve", status: "on_hand" }], visit: { dayOffset: 0, hour: 7, minutes: 75, tech: "tech-a" },
      log: [book(200), [150, "agent", "diagnosis", "Diagnosis summary: clogged water inlet valve."], [60, "coordinator", "schedule", "Tech A booked today 07:00 UTC."], [3, "tech", "stage", "Stage Scheduled -> Completed."], [3, "tech", "note", "Handoff note: valve replaced, flow tested, ticket closed."]] },
    { id: "T-1009", customer: "Sofia Alvarez", category: "washer", appliance: "Washer (top-load)", issue: "Violent shaking on spin", symptom: "violent shaking", stage: "Parts", promisedInH: 14, diagnosed: true,
      parts: [{ name: "Suspension rods", status: "ordered", etaAtMs: nowMs + 10 * H }],
      log: [book(60), [40, "agent", "diagnosis", "Diagnosis summary: worn suspension rods."], [40, "agent", "part", "Part ordered: Suspension rods."], [40, "agent", "stage", "Stage Diagnosed -> Parts."]] },
    { id: "T-1010", customer: "Noah Fischer", category: "oven", appliance: "Oven (electric wall)", issue: "Door won't latch", symptom: "door won't latch", stage: "Scheduled", promisedInH: 40, diagnosed: true, tech: "tech-a",
      parts: [{ name: "Latch assembly", status: "on_hand" }], visit: { dayOffset: 0, hour: 10, minutes: 90, tech: "tech-a" },
      log: [book(130), [100, "agent", "diagnosis", "Diagnosis summary: broken latch assembly."], [100, "agent", "part", "Part from stock: Latch assembly."], [26, "coordinator", "schedule", "Tech A booked today 10:00 UTC."], [26, "coordinator", "stage", "Stage Diagnosed -> Scheduled."]] },
  ];
  // visit minutes field above is the duration; keep it explicit
  const { tickets, parts, visits, events } = c.t;
  const tx = c.orm;
  {
    for (const k of list) {
      await tx.insert(tickets).values({ id: k.id, owner, customer: k.customer, category: k.category, appliance: k.appliance, issue: k.issue, symptom: k.symptom, stage: k.stage, promisedBy: iso(nowMs + k.promisedInH * H), diagnosed: k.diagnosed, tech: k.tech ?? null });
      for (const [i, p] of k.parts.entries()) await tx.insert(parts).values({ id: `${owner}:${k.id}:${i}`, owner, ticketId: k.id, name: p.name, status: p.status, eta: p.etaAtMs ? iso(p.etaAtMs) : null });
      if (k.visit) {
        const start = at(k.visit.dayOffset, k.visit.hour);
        await tx.insert(visits).values({ owner, ticketId: k.id, tech: k.visit.tech, start: iso(start), end: iso(start + k.visit.minutes * 60_000) });
      }
      for (const [ago, actor, kind, text] of k.log) await tx.insert(events).values({ owner, ticketId: k.id, at: iso(nowMs - ago * H), actor, kind, text });
    }
  }
}
