import { route } from "@/lib/api";
import { board, resetOwner } from "@/lib/service";
export const dynamic = "force-dynamic";
export const POST = route(true, async ({ db, owner, now }) => { await resetOwner(db, owner, now); return board(db, owner, now); });
