"use client";
import { useState } from "react";
import type { BoardData, TicketDetailData } from "@/lib/types";
import { fmtStamp, toInput } from "@/lib/format";
import { api } from "./App";
import { FlagPill, StagePill, Synthetic } from "./ui";

const ACTOR_STYLE: Record<string, string> = { agent: "text-accent", coordinator: "text-slate-700", tech: "text-emerald-700" };

export default function TicketDrawer({ detail, board, onClose, onChanged }: {
  detail: TicketDetailData | null; board: BoardData | null; onClose: () => void; onChanged: () => Promise<void>;
}) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [techSel, setTech] = useState<string | null>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [partName, setPartName] = useState("");
  const [eta, setEta] = useState("");

  const tech = techSel ?? detail?.tech ?? "tech-a";

  const run = async (label: string, path: string, body: unknown) => {
    setBusy(true); setMsg(null);
    try { await api(path, "POST", body); setMsg({ ok: true, text: `${label}: done` }); await onChanged(); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(false); }
  };

  return (
    <aside aria-label="Ticket detail" className="fixed inset-0 z-20 overflow-y-auto bg-white lg:inset-y-0 lg:left-auto lg:right-0 lg:w-[480px] lg:border-l lg:border-line">
      {!detail ? <div className="p-4 text-sm text-slate-500">Loading ticket...</div> : (
        <div className="space-y-5 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2"><span className="font-mono text-sm text-slate-500">{detail.id}</span><StagePill stage={detail.stage} /><Synthetic /></div>
              <h2 className="mt-1 text-lg font-semibold">{detail.customer}</h2>
              <p className="text-sm text-slate-600">{detail.appliance} - {detail.issue}</p>
              <p className="mt-1 font-mono text-xs text-slate-500">promised by {fmtStamp(detail.promisedBy)}{detail.visit ? ` | visit ${fmtStamp(detail.visit.start)} to ${fmtStamp(detail.visit.end)} (${detail.visit.tech})` : " | no visit booked"}</p>
            </div>
            <button className="btn" onClick={onClose}>Close</button>
          </div>

          {msg && <div role="status" className={`rounded-btn border bg-white px-3 py-2 text-sm ${msg.ok ? "border-emerald-300 text-emerald-700" : "border-red-300 text-red-700"}`}>{msg.text}</div>}

          <section>
            <h3 className="label mb-1">Attention flags</h3>
            {detail.flags.length === 0 ? <p className="text-sm text-slate-500">No rule is firing for this ticket.</p> : (
              <ul className="space-y-2">
                {detail.flags.map((f) => (
                  <li key={f.flag} className="card p-2.5">
                    <FlagPill flag={f.flag} />
                    <p className="mt-1 text-xs text-slate-700"><span className="font-semibold">Rule:</span> {f.rule}</p>
                    <p className="font-mono text-[11px] text-slate-500">{f.detail}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="label mb-1">Next allowed actions</h3>
            {detail.nextStages.length === 0 && <p className="text-sm text-slate-500">Ticket is complete. No further stage moves.</p>}
            <div className="space-y-1.5">
              {detail.nextStages.map((n) => (
                <div key={n.to}>
                  <button className="btn-primary" disabled={busy || !!n.blocked} onClick={() => run(`Advance to ${n.to}`, `/api/tickets/${detail.id}/advance`, { to: n.to })}>Advance to {n.to}</button>
                  {n.blocked && <span className="ml-2 text-xs text-slate-500">{n.blocked}</span>}
                </div>
              ))}
            </div>
          </section>

          {detail.actions.assign && (
            <section>
              <h3 className="label mb-1">Technician and visit (times UTC)</h3>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-slate-600">Technician
                  <select className="input mt-0.5" value={tech} onChange={(e) => setTech(e.target.value)}>
                    {(board?.techs ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
                <div className="flex items-end"><button className="btn" disabled={busy} onClick={() => run("Assign technician", `/api/tickets/${detail.id}/assign`, { tech })}>Assign technician</button></div>
                {detail.actions.schedule && <>
                  <label className="text-xs text-slate-600">Visit start
                    <input className="input mt-0.5 font-mono" type="datetime-local" value={start || (detail.visit ? toInput(detail.visit.start) : "")} onChange={(e) => setStart(e.target.value)} />
                  </label>
                  <label className="text-xs text-slate-600">Visit end
                    <input className="input mt-0.5 font-mono" type="datetime-local" value={end || (detail.visit ? toInput(detail.visit.end) : "")} onChange={(e) => setEnd(e.target.value)} />
                  </label>
                  <div className="col-span-2">
                    <button className="btn-primary" disabled={busy} onClick={() => run(detail.visit ? "Reschedule visit" : "Schedule visit", `/api/tickets/${detail.id}/schedule`,
                      { tech, start: start || (detail.visit ? toInput(detail.visit.start) : ""), end: end || (detail.visit ? toInput(detail.visit.end) : "") })}>
                      {detail.visit ? "Reschedule visit" : "Schedule visit"}
                    </button>
                    <span className="ml-2 text-xs text-slate-500">Overlapping slots for the same technician are rejected (409).</span>
                  </div>
                </>}
              </div>
            </section>
          )}

          <section>
            <h3 className="label mb-1">Parts</h3>
            {detail.parts.length === 0 && <p className="text-sm text-slate-500">No parts on this ticket.</p>}
            <ul className="space-y-1.5">
              {detail.parts.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>{p.name} <span className="font-mono text-xs text-slate-500">{p.status === "ordered" ? `ordered, ETA ${p.eta ? fmtStamp(p.eta) : "?"}` : "on hand"}</span></span>
                  {p.status === "ordered" && detail.actions.receivePart && <button className="btn !py-1 text-xs" disabled={busy} onClick={() => run("Mark received", `/api/tickets/${detail.id}/parts/${encodeURIComponent(p.id)}/receive`, {})}>Mark received</button>}
                </li>
              ))}
            </ul>
            {detail.actions.orderPart && (
              <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                <input className="input" placeholder="Part name" maxLength={80} value={partName} onChange={(e) => setPartName(e.target.value)} />
                <input className="input font-mono" type="date" aria-label="Part ETA" value={eta} onChange={(e) => setEta(e.target.value)} />
                <div className="col-span-2">
                  <button className="btn" disabled={busy || !partName || !eta} onClick={() => run("Order part", `/api/tickets/${detail.id}/parts`, { name: partName, eta })}>Order part with ETA</button>
                  <span className="ml-2 text-xs text-slate-500">A date-only ETA is taken as 17:00 UTC.</span>
                </div>
              </div>
            )}
          </section>

          {detail.suggestions.length > 0 && (
            <section>
              <h3 className="label mb-1">Pre-ID stand-in: sample parts lookup</h3>
              <p className="mb-1 text-xs text-slate-500">Fixed sample lookup, not a model. Matched on appliance &quot;{detail.category}&quot; + symptom &quot;{detail.symptom}&quot;; ranked by position in the table row.</p>
              <ol className="card divide-y divide-line">
                {detail.suggestions.map((s) => (
                  <li key={s.part} className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-sm">
                    <span><span className="mr-2 font-mono text-xs text-slate-500">#{s.rank}</span>{s.part}</span>
                    {detail.actions.orderPart && <button className="btn !py-0.5 text-xs" onClick={() => setPartName(s.part)}>Use name</button>}
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section>
            <h3 className="label mb-1">Handoff timeline</h3>
            <ol className="relative ml-1 border-l border-line pl-4">
              {detail.timeline.map((e, i) => (
                <li key={i} className="mb-3">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono text-slate-500">{fmtStamp(e.at)}</span>
                    <span className={`label ${ACTOR_STYLE[e.actor] ?? ""}`}>{e.actor}</span>
                  </div>
                  <p className="text-sm">{e.text}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
    </aside>
  );
}
