import { Agenda } from "@/components/admin/agenda";
import { serverDb } from "@/lib/supabase/server";
export default async function Page() {
  const db = await serverDb();
  const { data: { user } } = await db.auth.getUser();
  const { data } = await db.from("profiles").select("role").eq("id", user!.id).single();
  return <Agenda barberMode={data?.role === "barber"} />;
}
