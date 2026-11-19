import { route } from "@/lib/api";
import { daySchedule } from "@/lib/service";
export const dynamic = "force-dynamic";
export const GET = route(false, ({ db, owner, now, req }) =>
  daySchedule(db, owner, req.nextUrl.searchParams.get("date") ?? new Date(now).toISOString().slice(0, 10), now));
