import { describe, expect, it } from "vitest";
import { attentionFlags, canTransition, overlaps, parseIso, suggestParts, transitionBlock, TRANSITIONS, STAGES, SLA_WINDOW_HOURS, RuleInput } from "./domain";

const NOW = Date.parse("2026-03-10T09:00:00Z");
const base: RuleInput = { stage: "Booked", diagnosed: false, promisedBy: "2026-03-20T00:00:00Z", parts: [], visit: null };
const names = (k: RuleInput) => attentionFlags(k, NOW).map((f) => f.flag);

describe("transition table", () => {
  it("allows the forward steps in the table", () => {
    expect(canTransition("Booked", "Diagnosed")).toBe(true);
    expect(canTransition("Diagnosed", "Parts")).toBe(true);
    expect(canTransition("Diagnosed", "Scheduled")).toBe(true);
    expect(canTransition("Scheduled", "Completed")).toBe(true);
  });
  it("rejects skips, reversals and exits from Completed", () => {
    expect(canTransition("Booked", "Scheduled")).toBe(false);
    expect(canTransition("Parts", "Diagnosed")).toBe(false);
    expect(canTransition("Completed", "Booked")).toBe(false);
    expect(TRANSITIONS.Completed).toHaveLength(0);
    for (const s of STAGES) expect(canTransition(s, s)).toBe(false);
  });
  it("requires a visit for Scheduled", () => {
    expect(transitionBlock("Parts", "Scheduled", { hasVisit: false })).toMatch(/visit/);
    expect(transitionBlock("Parts", "Scheduled", { hasVisit: true })).toBeNull();
  });
});

describe("attention rules", () => {
  it("PART DELAYED when ordered ETA is after visit start", () => {
    const k: RuleInput = { ...base, stage: "Scheduled", diagnosed: true, visit: { start: "2026-03-12T10:00:00Z" }, parts: [{ id: "p", name: "Igniter", status: "ordered", eta: "2026-03-12T14:00:00Z" }] };
    expect(names(k)).toContain("PART DELAYED");
    k.parts[0].eta = "2026-03-12T10:00:00Z";
    expect(names(k)).not.toContain("PART DELAYED");
    k.parts[0].eta = "2026-03-12T14:00:00Z"; k.parts[0].status = "on_hand";
    expect(names(k)).not.toContain("PART DELAYED");
  });
  it("SLA RISK at exactly the 24h threshold, not beyond, and only before Scheduled", () => {
    expect(SLA_WINDOW_HOURS).toBe(24);
    const at = (h: number) => new Date(NOW + h * 3600_000).toISOString();
    expect(names({ ...base, promisedBy: at(24) })).toContain("SLA RISK");
    expect(names({ ...base, promisedBy: at(24.01) })).not.toContain("SLA RISK");
    expect(names({ ...base, promisedBy: at(-3) })).toContain("SLA RISK");
    expect(names({ ...base, stage: "Scheduled", diagnosed: true, visit: { start: at(30) }, promisedBy: at(5) })).not.toContain("SLA RISK");
    expect(names({ ...base, stage: "Completed", promisedBy: at(5) })).not.toContain("SLA RISK");
  });
  it("READY TO SCHEDULE needs diagnosis, no open order, no visit", () => {
    const k: RuleInput = { ...base, stage: "Diagnosed", diagnosed: true };
    expect(names(k)).toContain("READY TO SCHEDULE");
    expect(names({ ...k, parts: [{ id: "p", name: "x", status: "on_hand", eta: null }] })).toContain("READY TO SCHEDULE");
    expect(names({ ...k, parts: [{ id: "p", name: "x", status: "ordered", eta: "2026-03-15T00:00:00Z" }] })).not.toContain("READY TO SCHEDULE");
    expect(names({ ...k, visit: { start: "2026-03-12T10:00:00Z" } })).not.toContain("READY TO SCHEDULE");
    expect(names({ ...k, stage: "Booked" })).not.toContain("READY TO SCHEDULE");
    expect(names({ ...k, diagnosed: false })).not.toContain("READY TO SCHEDULE");
  });
});

describe("parts lookup (fixed sample table)", () => {
  it("ranks by table position", () => {
    const s = suggestParts("washer", "won't drain");
    expect(s.map((x) => x.part)).toEqual(["Drain pump", "Drain hose"]);
    expect(s.map((x) => x.rank)).toEqual([1, 2]);
  });
  it("is case-insensitive and empty for unknown input", () => {
    expect(suggestParts("Washer", "WON'T DRAIN")).toHaveLength(2);
    expect(suggestParts("washer", "haunted")).toEqual([]);
  });
});

describe("intervals and ISO parsing", () => {
  it("overlap is half-open", () => {
    const a = { start: "2026-03-10T10:00:00Z", end: "2026-03-10T11:00:00Z" };
    expect(overlaps(a, { start: "2026-03-10T10:30:00Z", end: "2026-03-10T12:00:00Z" })).toBe(true);
    expect(overlaps(a, { start: "2026-03-10T11:00:00Z", end: "2026-03-10T12:00:00Z" })).toBe(false);
  });
  it("parseIso accepts ISO only", () => {
    expect(parseIso("2026-03-14")).toBe("2026-03-14T17:00:00.000Z");
    expect(parseIso("2026-03-14T08:30")).toBe("2026-03-14T08:30:00.000Z");
    expect(parseIso("next tuesday")).toBeNull();
    expect(parseIso("2026-13-45")).toBeNull();
    expect(parseIso(5)).toBeNull();
  });
});
