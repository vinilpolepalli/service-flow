import { route } from "@/lib/api";
import { advance } from "@/lib/service";
export const dynamic = "force-dynamic";
export const POST = route<{ id: string }>(true, ({ db, owner, now, params, body }) => advance(db, owner, params.id, body, now));
