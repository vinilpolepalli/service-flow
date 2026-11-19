import type { Flag, PartRow, Stage } from "./domain";
export type FlagResult = { flag: Flag; rule: string; detail: string };
export type TicketCard = {
  id: string; customer: string; synthetic: true; category: string; appliance: string; issue: string; symptom: string;
  stage: Stage; promisedBy: string; diagnosed: boolean; tech: string | null;
  parts: PartRow[]; visit: { tech: string; start: string; end: string } | null; flags: FlagResult[];
};
export type BoardData = {
  now: string; stages: Stage[]; techs: { id: string; name: string }[];
  thresholds: { slaWindowHours: number; rules: Record<Flag, string> }; tickets: TicketCard[];
};
export type TicketDetailData = TicketCard & {
  timeline: { at: string; actor: string; kind: string; text: string }[];
  nextStages: { to: Stage; blocked: string | null }[];
  actions: { assign: boolean; schedule: boolean; orderPart: boolean; receivePart: boolean };
  suggestions: { rank: number; part: string; rule: string }[];
  suggestionsLabel: string;
};
export type ScheduleData = {
  date: string; now: string;
  techs: { id: string; name: string; visits: { ticketId: string; customer: string; appliance: string; stage: string; start: string; end: string }[] }[];
};
