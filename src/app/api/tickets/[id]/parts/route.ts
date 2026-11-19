import { route } from "@/lib/api";
import { orderPart } from "@/lib/service";
export const dynamic = "force-dynamic";
export const POST = route<{ id: string }>(true, ({ db, owner, now, params, body }) => orderPart(db, owner, params.id, body, now));
