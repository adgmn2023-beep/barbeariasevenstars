import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { privilegedDb } from "@/lib/supabase/server";
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user: actor } = await requireAdmin();
    const id = z.uuid().parse((await params).id);
    const db = privilegedDb();
    const { data: client, error } = await db
      .from("profiles")
      .select("id,role")
      .eq("id", id)
      .single();
    if (error || client?.role !== "client")
      return NextResponse.json(
        { error: "Cliente não encontrado." },
        { status: 404 },
      );
    const password = `${randomBytes(18).toString("base64url")}Aa1!`;
    // Marcar antes de alterar Auth: uma falha jamais deixa a nova senha sem a exigência.
    const { error: flagError } = await db
      .from("profiles")
      .update({ must_change_password: true })
      .eq("id", id);
    if (flagError) throw new Error("flag");
    const { error: authError } = await db.auth.admin.updateUserById(id, {
      password,
    });
    if (authError) throw new Error("auth");
    const { error: auditError } = await db
      .from("audit_log")
      .insert({
        actor_profile_id: actor.id,
        target_profile_id: id,
        action: "client_password_reset",
      });
    if (auditError) throw new Error("audit");
    return NextResponse.json(
      { provisionalPassword: password },
      { headers: { "Cache-Control": "no-store, private", Pragma: "no-cache" } },
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "Não foi possível redefinir a senha. Verifique seu acesso e tente novamente.",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
