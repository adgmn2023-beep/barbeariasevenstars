import { NextResponse } from "next/server";
import { z } from "zod";
import { serverDb, privilegedDb } from "@/lib/supabase/server";
import { readableError } from "@/lib/validation";

const passwordSchema = z
  .string()
  .min(12)
  .max(128)
  .regex(/[a-z]/)
  .regex(/[A-Z]/)
  .regex(/\d/)
  .regex(/[^A-Za-z0-9]/);

export async function POST(request: Request) {
  try {
    const { password } = z
      .object({ password: passwordSchema })
      .parse(await request.json());
    const db = await serverDb();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user)
      return NextResponse.json(
        { error: "Entre na sua conta para continuar." },
        { status: 401 },
      );
    const { error: passwordError } = await db.auth.updateUser({ password });
    if (passwordError) throw passwordError;
    const privileged = privilegedDb();
    const { error } = await privileged
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", user.id);
    if (error) throw error;
    const { error: auditError } = await privileged.from("audit_log").insert({
      actor_profile_id: user.id,
      target_profile_id: user.id,
      action: "provisional_password_changed",
    });
    if (auditError) throw auditError;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: readableError(error) }, { status: 400 });
  }
}