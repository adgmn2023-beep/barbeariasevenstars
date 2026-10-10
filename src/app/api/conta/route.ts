import { NextResponse } from "next/server";
import { z } from "zod";
import { serverDb, privilegedDb } from "@/lib/supabase/server";
import { readableError } from "@/lib/validation";
export async function DELETE(request: Request) {
  try {
    z.object({ confirmation: z.literal("EXCLUIR") }).parse(
      await request.json(),
    );
    const db = await serverDb();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user)
      return NextResponse.json(
        { error: "Entre na sua conta para continuar." },
        { status: 401 },
      );
    const { error } = await privilegedDb().rpc("erase_account_data", {
      p_user_id: user.id,
    });
    if (error) throw error;
    await db.auth.signOut();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: readableError(e) }, { status: 400 });
  }
}
