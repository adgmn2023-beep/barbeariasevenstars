import { Blocks } from "@/components/admin/catalog";
import { serverDb } from "@/lib/supabase/server";
export default async function Page() {
  const db = await serverDb();
  const { data: { user } } = await db.auth.getUser();
  const { data } = await db.from("profiles").select("role").eq("id", user!.id).single();
  return <Blocks barberMode={data?.role === "barber"} />;
}
