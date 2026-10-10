import { NextResponse } from "next/server";
import { z } from "zod";
import { serverDb } from "@/lib/supabase/server";
import { allowedPushEndpoint } from "@/lib/push";
import { readableError } from "@/lib/validation";
const endpoint = z
  .url()
  .max(2048)
  .refine(allowedPushEndpoint, "Este serviço de notificações não é suportado.");
export async function POST(request: Request) {
  try {
    const body = z
      .object({
        endpoint,
        keys: z.object({
          p256dh: z.string().min(20).max(200),
          auth: z.string().min(10).max(100),
        }),
      })
      .parse(await request.json());
    const db = await serverDb();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user)
      return NextResponse.json(
        { error: "Entre para ativar notificações." },
        { status: 401 },
      );
    const { error } = await db
      .from("push_subscriptions")
      .upsert(
        { user_id: user.id, endpoint: body.endpoint, ...body.keys },
        { onConflict: "endpoint" },
      );
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: readableError(e) }, { status: 400 });
  }
}
export async function DELETE(request: Request) {
  try {
    const body = z.object({ endpoint }).parse(await request.json());
    const db = await serverDb();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user)
      return NextResponse.json(
        { error: "Entre para desativar notificações." },
        { status: 401 },
      );
    const { error } = await db
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", body.endpoint)
      .eq("user_id", user.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: readableError(e) }, { status: 400 });
  }
}
