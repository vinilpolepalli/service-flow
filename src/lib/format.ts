const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const p2 = (n: number) => String(n).padStart(2, "0");
/** "Mar 10 09:00Z" in UTC so every viewer sees the same instants the rules use. */
export function fmtStamp(iso: string) {
  const d = new Date(iso);
  return `${MON[d.getUTCMonth()]} ${d.getUTCDate()} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}Z`;
}
export const fmtClock = (iso: string) => { const d = new Date(iso); return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`; };
export const dayOf = (iso: string) => iso.slice(0, 10);
export function shiftDay(day: string, delta: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + delta * 86400_000).toISOString().slice(0, 10);
}
/** datetime-local value (interpreted as UTC) */
export const toInput = (iso: string) => iso.slice(0, 16);
