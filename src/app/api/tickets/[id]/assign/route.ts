import { route } from "@/lib/api";
import { assign } from "@/lib/service";
export const dynamic = "force-dynamic";
export const POST = route<{ id: string }>(true, ({ db, owner, now, params, body }) => assign(db, owner, params.id, body, now));
