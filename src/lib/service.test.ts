import { beforeEach, describe, expect, it } from "vitest";
import { createDb, Db } from "@/db";
import * as svc from "./service";

const NOW = Date.parse("2026-03-10T09:00:00Z");
let db: Db;
beforeEach(async () => { db = createDb(":memory:"); await svc.ensureOwner(db, "o1", NOW); await svc.ensureOwner(db, "o2", NOW); });
const flags = async (id: string, owner = "o1") => (await svc.ticketDetail(db, owner, id, NOW)).flags.map((f) => f.flag);

describe("seed", () => {
  it("creates 10 synthetic tickets per owner", async () => {
    const b = await svc.board(db, "o1", NOW);
    expect(b.tickets).toHaveLength(10);
    expect(b.tickets.every((t) => t.synthetic)).toBe(true);
    expect((await svc.board(db, "o2", NOW)).tickets).toHaveLength(10);
  });
});

describe("double booking", () => {
  it("rejects an overlapping slot for the same tech with 409 and allows the other tech", async () => {
    await svc.schedule(db, "o1", "T-1003", { tech: "tech-a", start: "2026-03-14T09:00", end: "2026-03-14T10:30" }, NOW);
    await expect(svc.schedule(db, "o1", "T-1004", { tech: "tech-a", start: "2026-03-14T10:00", end: "2026-03-14T11:00" }, NOW))
      .rejects.toThrowError(expect.objectContaining({ status: 409 }));
    await svc.schedule(db, "o1", "T-1004", { tech: "tech-b", start: "2026-03-14T10:00", end: "2026-03-14T11:00" }, NOW);
    await svc.schedule(db, "o1", "T-1005", { tech: "tech-a", start: "2026-03-14T10:30", end: "2026-03-14T11:30" }, NOW); // back-to-back ok
  });
  it("lets a ticket reschedule over its own slot, and rejects reassign into a conflict", async () => {
    await svc.schedule(db, "o1", "T-1003", { tech: "tech-a", start: "2026-03-14T09:00", end: "2026-03-14T10:30" }, NOW);
    await svc.schedule(db, "o1", "T-1003", { tech: "tech-a", start: "2026-03-14T09:30", end: "2026-03-14T10:30" }, NOW);
    await svc.schedule(db, "o1", "T-1004", { tech: "tech-b", start: "2026-03-14T09:00", end: "2026-03-14T10:00" }, NOW);
    await expect(svc.assign(db, "o1", "T-1004", { tech: "tech-a" }, NOW)).rejects.toThrowError(expect.objectContaining({ status: 409 }));
  });
  it("does not conflict across owners", async () => {
    await svc.schedule(db, "o1", "T-1003", { tech: "tech-a", start: "2026-03-14T09:00", end: "2026-03-14T10:30" }, NOW);
    await svc.schedule(db, "o2", "T-1003", { tech: "tech-a", start: "2026-03-14T09:00", end: "2026-03-14T10:30" }, NOW);
  });
});

describe("actions", () => {
  it("advances through stages with timeline events and recomputed flags", async () => {
    expect(await flags("T-1003")).toContain("READY TO SCHEDULE");
    await svc.schedule(db, "o1", "T-1003", { tech: "tech-a", start: "2026-03-14T09:00", end: "2026-03-14T10:30" }, NOW);
    expect(await flags("T-1003")).not.toContain("READY TO SCHEDULE");
    const d = await svc.advance(db, "o1", "T-1003", { to: "Scheduled" }, NOW);
    expect(d.stage).toBe("Scheduled");
    expect(d.timeline.at(-1)?.text).toBe("Stage Diagnosed -> Scheduled.");
    await expect(svc.advance(db, "o1", "T-1003", { to: "Booked" }, NOW)).rejects.toThrowError(expect.objectContaining({ status: 409 }));
  });
  it("requires a visit before Scheduled", async () => {
    await expect(svc.advance(db, "o1", "T-1003", { to: "Scheduled" }, NOW)).rejects.toThrowError(expect.objectContaining({ status: 409 }));
  });
  it("fires PART DELAYED when a part ETA is past the visit, clears when received", async () => {
    await svc.schedule(db, "o1", "T-1003", { tech: "tech-a", start: "2026-03-14T09:00", end: "2026-03-14T10:30" }, NOW);
    const d = await svc.orderPart(db, "o1", "T-1003", { name: "Thermostat", eta: "2026-03-16" }, NOW);
    expect(d.flags.map((f) => f.flag)).toContain("PART DELAYED");
    await svc.receivePart(db, "o1", "T-1003", d.parts.find((p) => p.name === "Thermostat")!.id, {}, NOW);
    expect(await flags("T-1003")).not.toContain("PART DELAYED");
  });
  it("validates inputs", async () => {
    await expect(svc.orderPart(db, "o1", "T-1003", { name: "x", eta: "soon" }, NOW)).rejects.toThrowError(expect.objectContaining({ status: 400 }));
    await expect(svc.assign(db, "o1", "T-1003", { tech: "tech-z" }, NOW)).rejects.toThrowError(expect.objectContaining({ status: 400 }));
    await expect(svc.advance(db, "o1", "T-1003", { to: "Nope" }, NOW)).rejects.toThrowError(expect.objectContaining({ status: 400 }));
  });
});

describe("isolation and rate limit", () => {
  it("hides tickets across owners with 404", async () => {
    await expect(svc.ticketDetail(db, "o3", "T-1001", NOW)).rejects.toThrowError(expect.objectContaining({ status: 404 }));
    await expect(svc.advance(db, "o3", "T-1001", { to: "Diagnosed" }, NOW)).rejects.toThrowError(expect.objectContaining({ status: 404 }));
  });
  it("limits to 120 writes per rolling hour", async () => {
    for (let i = 0; i < 120; i++) await svc.consumeWrite(db, "o1", NOW + i);
    await expect(svc.consumeWrite(db, "o1", NOW + 500)).rejects.toThrowError(expect.objectContaining({ status: 429 }));
    await svc.consumeWrite(db, "o2", NOW);
    await svc.consumeWrite(db, "o1", NOW + 3700_000);
  });
});
