"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Flag } from "@/lib/domain";
import type { BoardData, ScheduleData, TicketDetailData } from "@/lib/types";
import { dayOf } from "@/lib/format";
import Board from "./Board";
import TicketDrawer from "./TicketDrawer";
import SchedulePanel from "./SchedulePanel";
import { FlagPill } from "./ui";

export async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(path, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status}: ${data.error ?? "Request failed"}`);
  return data as T;
}

const FLAGS: Flag[] = ["PART DELAYED", "SLA RISK", "READY TO SCHEDULE"];

export default function App() {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [detail, setDetail] = useState<TicketDetailData | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [sched, setSched] = useState<ScheduleData | null>(null);
  const [filter, setFilter] = useState<Flag | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const loadBoard = useCallback(async () => { try { setBoard(await api<BoardData>("/api/board")); } catch (e) { setErr((e as Error).message); } }, []);
  const loadDetail = useCallback(async (id: string) => { try { setDetail(await api<TicketDetailData>(`/api/tickets/${id}`)); } catch (e) { setErr((e as Error).message); } }, []);
  const loadSched = useCallback(async (d: string) => { try { setSched(await api<ScheduleData>(`/api/schedule?date=${d}`)); } catch (e) { setErr((e as Error).message); } }, []);

  useEffect(() => {
    loadBoard();
    const q = new URLSearchParams(window.location.search);
    if (q.get("ticket")) setSel(q.get("ticket"));
    if (q.get("date")) setDay(q.get("date"));
  }, [loadBoard]);
  useEffect(() => { if (board && !day) setDay(dayOf(board.now)); }, [board, day]);
  useEffect(() => { if (sel) loadDetail(sel); else setDetail(null); }, [sel, loadDetail]);
  useEffect(() => { if (day) loadSched(day); }, [day, loadSched]);

  const refresh = useCallback(async () => {
    await Promise.all([loadBoard(), sel ? loadDetail(sel) : null, day ? loadSched(day) : null]);
  }, [loadBoard, loadDetail, loadSched, sel, day]);

  const open = (id: string | null) => {
    setSel(id);
    const u = new URL(window.location.href);
    if (id) u.searchParams.set("ticket", id); else u.searchParams.delete("ticket");
    window.history.replaceState(null, "", u);
  };

  const counts = useMemo(() => {
    const c: Record<Flag, number> = { "PART DELAYED": 0, "SLA RISK": 0, "READY TO SCHEDULE": 0 };
    board?.tickets.forEach((t) => t.flags.forEach((f) => c[f.flag]++));
    return c;
  }, [board]);
  const attention = useMemo(() => (board?.tickets ?? []).filter((t) => t.flags.length), [board]);

  const reset = async () => { await api("/api/reset", "POST", {}); open(null); await refresh(); };

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-base font-semibold tracking-tight">Service Flow</span>
            <span className="pill border-accent bg-white text-accent">Synthetic data - demo</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>Demo Appliance Co (fictional)</span>
            {board && <span className="font-mono">server clock {board.now.slice(0, 16).replace("T", " ")}Z</span>}
            <button className="btn !py-1 text-xs" onClick={reset}>Reset demo data</button>
          </div>
        </div>
      </header>

      <main className={`mx-auto max-w-[1500px] px-4 py-4 ${sel ? "lg:pr-[500px]" : ""}`}>
        {err && <div role="alert" className="mb-3 rounded-btn border border-red-300 bg-white px-3 py-2 text-sm text-red-700">{err} <button className="underline" onClick={() => setErr(null)}>dismiss</button></div>}

        <section aria-label="Needs attention" className="card mb-4 p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="label">Needs attention</h2>
            {FLAGS.map((f) => (
              <button key={f} onClick={() => setFilter(filter === f ? null : f)} aria-pressed={filter === f}
                className={`pill bg-white ${filter === f ? "border-accent text-accent" : "border-line text-slate-600"}`}>
                {f} <span className="ml-1 font-mono">{counts[f]}</span>
              </button>
            ))}
            {filter && <button className="text-xs text-slate-500 underline" onClick={() => setFilter(null)}>clear filter</button>}
          </div>
          <ul className="divide-y divide-line">
            {attention.length === 0 && <li className="py-2 text-sm text-slate-500">Nothing flagged right now.</li>}
            {attention.map((t) => (
              <li key={t.id}>
                <button onClick={() => open(t.id)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 py-2 text-left hover:bg-slate-50">
                  <span className="font-mono text-xs text-slate-500">{t.id}</span>
                  <span className="text-sm font-medium">{t.customer}</span>
                  <span className="text-sm text-slate-500">{t.issue}</span>
                  <span className="ml-auto flex flex-wrap gap-1">{t.flags.map((f) => <FlagPill key={f.flag} flag={f.flag} />)}</span>
                </button>
              </li>
            ))}
          </ul>
          {board && (
            <p className="mt-2 border-t border-line pt-2 text-xs text-slate-500">
              Fixed-threshold illustrations, recomputed from ticket state and the server clock on every load. PART DELAYED: part ETA after visit start.
              SLA RISK: promised window ends within {board.thresholds.slaWindowHours}h (or has passed) and stage is before Scheduled.
              READY TO SCHEDULE: Diagnosed or Parts, diagnosis done, no part on order, no visit booked.
            </p>
          )}
        </section>

        {board ? <Board board={board} filter={filter} selected={sel} onOpen={open} /> : <p className="text-sm text-slate-500">Loading board...</p>}

        {board && day && <SchedulePanel data={sched} day={day} setDay={setDay} today={dayOf(board.now)} onOpen={open} selected={sel} />}

        <footer className="mt-8 border-t border-line py-4 text-xs text-slate-500">
          Independent demo built by Vinil Polepalli. Synthetic data and fixed-threshold rules only. Not affiliated with or endorsed by Bernard.
        </footer>
      </main>

      {sel && <TicketDrawer detail={detail} board={board} onClose={() => open(null)} onChanged={refresh} />}
    </div>
  );
}
