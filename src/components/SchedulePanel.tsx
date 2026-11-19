import type { ScheduleData } from "@/lib/types";
import { fmtClock, shiftDay } from "@/lib/format";

const START_H = 7, END_H = 19;
const hours = Array.from({ length: END_H - START_H + 1 }, (_, i) => START_H + i);

export default function SchedulePanel({ data, day, setDay, today, onOpen, selected }: {
  data: ScheduleData | null; day: string; setDay: (d: string) => void; today: string; onOpen: (id: string) => void; selected: string | null;
}) {
  const dayStart = Date.parse(`${day}T00:00:00Z`);
  const pct = (iso: string) => Math.min(100, Math.max(0, ((Date.parse(iso) - dayStart) / 3600_000 - START_H) / (END_H - START_H) * 100));
  return (
    <section id="schedule" aria-label="Day schedule" className="card mt-6 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="label">Day schedule</h2>
          <p className="text-xs text-slate-500">Technician visits stored in the database, times in UTC. A technician cannot be booked into overlapping slots.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn !py-1" onClick={() => setDay(shiftDay(day, -1))} aria-label="Previous day">Prev</button>
          <span className="font-mono text-sm">{day}{day === today ? " (today)" : ""}</span>
          <button className="btn !py-1" onClick={() => setDay(shiftDay(day, 1))} aria-label="Next day">Next</button>
          {day !== today && <button className="btn !py-1" onClick={() => setDay(today)}>Today</button>}
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[680px]">
          <div className="relative ml-16 mr-4 h-5 border-b border-line">
            {hours.map((h) => (
              <span key={h} className="absolute -translate-x-1/2 font-mono text-[10px] text-slate-400" style={{ left: `${((h - START_H) / (END_H - START_H)) * 100}%` }}>{String(h).padStart(2, "0")}</span>
            ))}
          </div>
          {(data?.techs ?? []).map((te) => (
            <div key={te.id} className="flex items-stretch border-b border-line last:border-0">
              <div className="flex w-16 shrink-0 items-center text-sm font-medium">{te.name}</div>
              <div className="relative mr-4 h-16 flex-1">
                {hours.map((h) => <span key={h} className="absolute top-0 h-full border-l border-slate-100" style={{ left: `${((h - START_H) / (END_H - START_H)) * 100}%` }} />)}
                {te.visits.map((v) => (
                  <button key={v.ticketId} onClick={() => onOpen(v.ticketId)} title={`${v.ticketId} ${v.customer}`}
                    className={`absolute top-2 h-12 overflow-hidden rounded-btn border px-2 text-left text-[11px] leading-tight ${selected === v.ticketId ? "border-accent-hover bg-accent-hover" : "border-accent bg-accent hover:bg-accent-hover"} text-white`}
                    style={{ left: `${pct(v.start)}%`, width: `${Math.max(pct(v.end) - pct(v.start), 3)}%` }}>
                    <div className="font-mono">{fmtClock(v.start)}-{fmtClock(v.end)}</div>
                    <div className="truncate">{v.ticketId} {v.customer}</div>
                  </button>
                ))}
                {te.visits.length === 0 && <span className="absolute left-2 top-5 text-xs text-slate-400">No visits</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
