import { ForcePasswordChange } from "@/components/force-password-change";
import { serverDb } from "@/lib/supabase/server";
export default async function Page() {
  const db = await serverDb();
  const {
    data: { user },
  } = await db.auth.getUser();
  const { data: profile } = await db
    .from("profiles")
    .select("role")
    .eq("id", user?.id ?? "")
    .maybeSingle();
  return <ForcePasswordChange staff={profile?.role !== "client"} />;
}
