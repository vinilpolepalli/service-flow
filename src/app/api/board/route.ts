import { route } from "@/lib/api";
import { board } from "@/lib/service";
export const dynamic = "force-dynamic";
export const GET = route(false, ({ db, owner, now }) => board(db, owner, now));
