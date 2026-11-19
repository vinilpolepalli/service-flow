import type { Flag } from "@/lib/domain";

const FLAG_STYLE: Record<Flag, string> = {
  "PART DELAYED": "border-red-300 text-red-700",
  "SLA RISK": "border-orange-300 text-orange-700",
  "READY TO SCHEDULE": "border-emerald-300 text-emerald-700",
};
export function FlagPill({ flag }: { flag: Flag }) {
  return <span className={`pill bg-white ${FLAG_STYLE[flag]}`}>{flag}</span>;
}
export function StagePill({ stage }: { stage: string }) {
  return <span className="pill border-slate-300 bg-slate-100 text-slate-700">{stage}</span>;
}
export function Synthetic() {
  return <span className="label text-slate-400">synthetic</span>;
}
