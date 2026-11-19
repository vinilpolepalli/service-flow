import { route } from "@/lib/api";
import { ticketDetail } from "@/lib/service";
export const dynamic = "force-dynamic";
export const GET = route<{ id: string }>(false, ({ db, owner, now, params }) => ticketDetail(db, owner, params.id, now));
