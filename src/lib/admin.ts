import "server-only";
import { serverDb } from "./supabase/server";
export async function requireAdmin() {
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
  if (error || !["admin", "master"].includes(data?.role ?? ""))
    throw new Error("Acesso restrito ao administrador.");
  return { db, user };
}
