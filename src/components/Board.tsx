import type { Flag } from "@/lib/domain";
import type { BoardData } from "@/lib/types";
import { fmtStamp } from "@/lib/format";
import { FlagPill, Synthetic } from "./ui";

export default function Board({ board, filter, selected, onOpen }: { board: BoardData; filter: Flag | null; selected: string | null; onOpen: (id: string) => void }) {
  return (
    <section aria-label="Ticket board" className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
      {board.stages.map((stage) => {
        const items = board.tickets
          .filter((t) => t.stage === stage && (!filter || t.flags.some((f) => f.flag === filter)))
          .sort((a, b) => b.flags.length - a.flags.length || a.promisedBy.localeCompare(b.promisedBy));
        return (
          <div key={stage} className="min-w-0">
            <div className="mb-2 flex items-baseline justify-between border-b border-line pb-1">
              <h3 className="label">{stage}</h3>
              <span className="font-mono text-xs text-slate-500">{items.length}</span>
            </div>
            <ul className="space-y-2">
              {items.map((t) => (
                <li key={t.id}>
                  <button onClick={() => onOpen(t.id)} aria-label={`Open ticket ${t.id}`}
                    className={`card w-full p-3 text-left hover:border-slate-400 ${selected === t.id ? "!border-accent" : ""}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-slate-500">{t.id}</span>
                      <Synthetic />
                    </div>
                    <div className="mt-1 text-sm font-medium">{t.customer}</div>
                    <div className="text-xs text-slate-600">{t.appliance}</div>
                    <div className="text-xs text-slate-500">{t.issue}</div>
                    {t.flags.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{t.flags.map((f) => <FlagPill key={f.flag} flag={f.flag} />)}</div>}
                    <div className="mt-2 space-y-0.5 font-mono text-[11px] text-slate-500">
                      <div>promised {fmtStamp(t.promisedBy)}</div>
                      {t.visit && <div>visit {fmtStamp(t.visit.start)}</div>}
                    </div>
                  </button>
                </li>
              ))}
              {items.length === 0 && <li className="text-xs text-slate-400">No tickets</li>}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
