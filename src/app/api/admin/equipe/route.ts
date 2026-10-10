import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { canCreateTeamRole } from "@/lib/role-access";
import { privilegedDb } from "@/lib/supabase/server";
import { readableError } from "@/lib/validation";

const createSchema = z.object({
  nome: z.string().trim().min(2).max(120),
  email: z.email().trim().toLowerCase(),
  telefone: z
    .string()
    .transform((value) => value.replace(/\D/g, ""))
    .refine((value) => /^\d{10,11}$/.test(value), "Informe telefone com DDD."),
  role: z.enum(["barber", "admin"]),
  alsoBarber: z.boolean(),
});

const updateSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reactivate"), id: z.uuid() }),
  z.object({ action: z.literal("reset_password"), id: z.uuid() }),
  z.object({
    action: z.literal("deactivate"),
    id: z.uuid(),
    strategy: z.enum(["cancel", "reassign"]).optional(),
    reassign_to: z.uuid().nullable().optional(),
    cancel_reason: z.string().trim().min(3).max(500).optional(),
  }),
]);

async function actorContext() {
  const { db, user } = await requireAdmin();
  const { data, error } = await db
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (error || !data || !["admin", "master"].includes(data.role))
    throw new Error("Acesso restrito a admin e master.");
  return { db, user, role: data.role as "admin" | "master" };
}

function provisionalPassword() {
  return `${randomBytes(32).toString("base64url")}Aa1!`;
}

async function audit(
  actorId: string,
  action: string,
  targetId: string,
  details: Record<string, unknown> = {},
) {
  const { error } = await privilegedDb().from("audit_log").insert({
    actor_profile_id: actorId,
    action,
    target_profile_id: targetId,
    details,
  });
  if (error) throw error;
}

export async function GET() {
  try {
    await actorContext();
    const privileged = privilegedDb();
    const [{ data: profiles, error }, { data: barbers, error: barberError }] =
      await Promise.all([
        privileged
          .from("profiles")
          .select("id,nome,email,telefone,role,must_change_password")
          .in("role", ["barber", "admin", "master"])
          .order("nome"),
        privileged
          .from("barbers")
          .select("id,profile_id,display_name,active"),
      ]);
    if (error || barberError) throw error ?? barberError;

    const authUsers = [];
    for (let page = 1; ; page++) {
      const { data, error: authError } = await privileged.auth.admin.listUsers({
        page,
        perPage: 1000,
      });
      if (authError) throw authError;
      authUsers.push(...data.users);
      if (!data.nextPage) break;
    }
    const authById = new Map(authUsers.map((user) => [user.id, user]));
    const barberByProfile = new Map(
      (barbers ?? []).map((barber) => [barber.profile_id, barber]),
    );
    return NextResponse.json({
      members: (profiles ?? []).map((profile) => {
        const authUser = authById.get(profile.id);
        const barber = barberByProfile.get(profile.id) ?? null;
        return {
          ...profile,
          active: !!authUser && (!authUser.banned_until || new Date(authUser.banned_until) < new Date()),
          barber,
        };
      }),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: readableError(error) }, { status: 403 });
  }
}

export async function POST(request: Request) {
  let createdUserId: string | undefined;
  try {
    const { user: actor, role } = await actorContext();
    const input = createSchema.parse(await request.json());
    if (!canCreateTeamRole(role, input.role))
      return NextResponse.json(
        { error: "Admin comum só pode criar barbeiros." },
        { status: 403 },
      );
    const privileged = privilegedDb();
    const password = provisionalPassword();
    const { data, error } = await privileged.auth.admin.createUser({
      email: input.email,
      password,
      email_confirm: true,
      user_metadata: { nome: input.nome, telefone: input.telefone },
    });
    if (error || !data.user) throw error ?? new Error("Não foi possível criar o usuário.");
    createdUserId = data.user.id;

    const { error: profileError } = await privileged
      .from("profiles")
      .update({
        nome: input.nome,
        email: input.email,
        telefone: input.telefone,
        role: input.role,
        must_change_password: true,
      })
      .eq("id", data.user.id);
    if (profileError) throw profileError;
    if (input.alsoBarber || input.role === "barber") {
      const { error: barberError } = await privileged.from("barbers").insert({
        profile_id: data.user.id,
        display_name: input.nome,
      });
      if (barberError) throw barberError;
    }
    await audit(actor.id, "team_member_created", data.user.id, {
      role: input.role,
      also_barber: input.alsoBarber || input.role === "barber",
    });
    return NextResponse.json(
      {
        member: { id: data.user.id, nome: input.nome, email: input.email },
        provisionalPassword: password,
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (createdUserId) {
      await privilegedDb()
        .from("barbers")
        .delete()
        .eq("profile_id", createdUserId);
      await privilegedDb().auth.admin.deleteUser(createdUserId).catch(() => undefined);
    }
    return NextResponse.json({ error: readableError(error) }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { db, user: actor, role } = await actorContext();
    const input = updateSchema.parse(await request.json());
    const privileged = privilegedDb();
    const { data: target, error } = await privileged
      .from("profiles")
      .select("id,role")
      .eq("id", input.id)
      .single();
    if (error || !target) throw error ?? new Error("Usuário não encontrado.");
    if (target.role === "master" || input.id === actor.id)
      return NextResponse.json(
        { error: "Este usuário não pode ser desativado ou redefinido por aqui." },
        { status: 403 },
      );
    if (role === "admin" && target.role !== "barber")
      return NextResponse.json(
        { error: "Admin comum só pode gerenciar barbeiros." },
        { status: 403 },
      );

    if (input.action === "reset_password") {
      const password = provisionalPassword();
      const { error: authError } = await privileged.auth.admin.updateUserById(
        input.id,
        { password },
      );
      if (authError) throw authError;
      const { error: profileError } = await privileged
        .from("profiles")
        .update({ must_change_password: true })
        .eq("id", input.id);
      if (profileError) throw profileError;
      await audit(actor.id, "team_member_password_reset", input.id);
      return NextResponse.json(
        { provisionalPassword: password },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const { data: barber } = await privileged
      .from("barbers")
      .select("id,active")
      .eq("profile_id", input.id)
      .maybeSingle();
    if (input.action === "reactivate") {
      const { error: authError } = await privileged.auth.admin.updateUserById(
        input.id,
        { ban_duration: "none" },
      );
      if (authError) throw authError;
      if (barber) {
        const { error: barberError } = await privileged
          .from("barbers")
          .update({ active: true })
          .eq("id", barber.id);
        if (barberError) throw barberError;
      }
      await audit(actor.id, "team_member_reactivated", input.id);
      return NextResponse.json({ ok: true });
    }

    if (barber?.active) {
      if (input.strategy === "cancel") {
        if (!input.cancel_reason)
          return NextResponse.json(
            { error: "Informe um motivo para cancelar os agendamentos." },
            { status: 400 },
          );
        const { error: cancelError } = await privileged
          .from("appointments")
          .update({ status: "cancelado", cancel_reason: input.cancel_reason })
          .eq("barber_id", barber.id)
          .in("status", ["pendente", "confirmado"])
          .gt("start_at", new Date().toISOString());
        if (cancelError) throw cancelError;
      } else if (input.strategy !== "reassign" || !input.reassign_to) {
        return NextResponse.json(
          { error: "Escolha um barbeiro para remanejar ou cancele com motivo." },
          { status: 400 },
        );
      }
      const { error: deactivateError } = await db.rpc("deactivate_barber", {
        barber_id: barber.id,
        reassign_to: input.strategy === "reassign" ? input.reassign_to : null,
      });
      if (deactivateError) throw deactivateError;
    }

    const { error: banError } = await privileged.auth.admin.updateUserById(
      input.id,
      { ban_duration: "876000h" },
    );
    if (banError) throw banError;
    await audit(actor.id, "team_member_deactivated", input.id, {
      barber_id: barber?.id ?? null,
      strategy: input.strategy ?? null,
      reassign_to: input.strategy === "reassign" ? input.reassign_to : null,
      cancel_reason: input.strategy === "cancel" ? input.cancel_reason : null,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: readableError(error) }, { status: 400 });
  }
}