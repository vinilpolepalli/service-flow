import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import type { Db } from "@/db";
import { consumeWrite, ensureOwner, HttpError, MAX_BODY_BYTES } from "./service";

const COOKIE = "sf_uid";
const UID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Ctx<P> = { db: Db; owner: string; now: number; body: Record<string, unknown>; params: P; req: NextRequest };

async function readBody(req: NextRequest): Promise<Record<string, unknown>> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) throw new HttpError(413, `Body exceeds ${MAX_BODY_BYTES} bytes.`);
  const text = await req.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) throw new HttpError(413, `Body exceeds ${MAX_BODY_BYTES} bytes.`);
  if (!text.trim()) return {};
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new HttpError(400, "Body must be valid JSON."); }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new HttpError(400, "Body must be a JSON object.");
  return parsed as Record<string, unknown>;
}

/** Wraps a route: resolves the owner cookie (issuing one if needed), seeds, rate-limits writes, maps errors. */
export function route<P = Record<string, never>>(write: boolean, fn: (c: Ctx<P>) => unknown) {
  return async (req: NextRequest, rc: { params: Promise<P> }) => {
    const existing = req.cookies.get(COOKIE)?.value;
    const owner = existing && UID_RE.test(existing) ? existing : crypto.randomUUID();
    const respond = (status: number, payload: unknown) => {
      const res = NextResponse.json(payload, { status, headers: { "Cache-Control": "no-store" } });
      if (owner !== existing) res.cookies.set(COOKIE, owner, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 90 });
      return res;
    };
    try {
      const db = await getDb();
      const body = write ? await readBody(req) : {}; // read before taking the SQLite lock
      return await db.exclusive(async () => {
        const now = Date.now();
        await ensureOwner(db, owner, now);
        if (write) await consumeWrite(db, owner, now);
        return respond(200, await fn({ db, owner, now, body, params: await rc.params, req }));
      });
    } catch (e) {
      if (e instanceof HttpError) return respond(e.status, { error: e.message });
      console.error(e);
      return respond(500, { error: "Internal error." });
    }
  };
}
