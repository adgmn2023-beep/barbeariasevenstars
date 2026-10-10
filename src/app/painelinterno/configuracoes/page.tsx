import { Settings } from "@/components/admin/settings";
import { TeamManagement } from "@/components/admin/team";
import { redirect } from "next/navigation";
import { serverDb } from "@/lib/supabase/server";
export default async function Page() {
  const db = await serverDb();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login?next=/painelinterno/configuracoes");
  const { data } = await db.from("profiles").select("role").eq("id", user.id).single();
  if (!data || !["admin", "master"].includes(data.role)) redirect("/painelinterno");
  return (
    <>
      <Settings />
      <TeamManagement isMaster={data.role === "master"} />
    </>
  );
}
