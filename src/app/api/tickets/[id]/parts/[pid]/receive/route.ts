import { route } from "@/lib/api";
import { receivePart } from "@/lib/service";
export const dynamic = "force-dynamic";
export const POST = route<{ id: string; pid: string }>(true, ({ db, owner, now, params, body }) => receivePart(db, owner, params.id, params.pid, body, now));
