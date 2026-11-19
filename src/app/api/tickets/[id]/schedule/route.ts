import { route } from "@/lib/api";
import { schedule } from "@/lib/service";
export const dynamic = "force-dynamic";
export const POST = route<{ id: string }>(true, ({ db, owner, now, params, body }) => schedule(db, owner, params.id, body, now));
