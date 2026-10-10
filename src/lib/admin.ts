import "server-only";
import { redirect } from "next/navigation";
import { privilegedDb, serverDb } from "./supabase/server";
export async function requireStaff() {
  const db = await serverDb();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) throw new Error("Entre na sua conta para continuar.");
  const { data, error } = await db
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const role = data?.role;
  if (error || !role || !["barber", "admin", "master"].includes(role))
    throw new Error("Acesso restrito à equipe.");
  let barberId: string | null = null;
  if (role === "barber") {
    const { data: barber, error: barberError } = await privilegedDb()
      .from("barbers")
      .select("id,active")
      .eq("profile_id", user.id)
      .maybeSingle();
    if (barberError || !barber?.active)
      throw new Error("O acesso de barbeiro está desativado.");
    barberId = barber.id;
  }
  return { db, user, role, barberId };
}
export async function requireAdmin() {
  const context = await requireStaff();
  if (!["admin", "master"].includes(context.role))
    throw new Error("Acesso restrito ao administrador.");
  return context;
}
export async function requireAdminPage() {
  try {
    return await requireAdmin();
  } catch {
    redirect("/painelinterno");
  }
}
