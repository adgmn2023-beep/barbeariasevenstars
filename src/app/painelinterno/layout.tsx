import Link from "next/link";
import { redirect } from "next/navigation";
import { privilegedDb, serverDb } from "@/lib/supabase/server";
import { AdminAlerts } from "@/components/admin/alerts";
import { InstallPanel } from "@/components/admin/install-panel";
import { canAccessPanel } from "@/lib/role-access";
export const metadata = {
  title: "Seven Stars Admin",
  manifest: "/painelinterno/manifest.webmanifest",
};
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const db = await serverDb();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login?next=/painelinterno");
  const { data } = await db
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!data) redirect("/");
  let barberActive = false;
  if (data.role === "barber") {
    const { data: barber } = await privilegedDb()
      .from("barbers")
      .select("active")
      .eq("profile_id", user.id)
      .maybeSingle();
    barberActive = !!barber?.active;
  }
  if (!canAccessPanel(data.role, barberActive)) redirect("/");
  const navigation = [
    ["", "Agenda"],
    ["bloqueios", "Bloqueios"],
    ...(data.role === "barber"
      ? []
      : [
          ["servicos", "Serviços"],
          ["clientes", "Clientes"],
          ["dashboard", "Dashboard"],
          ["configuracoes", "Configurações"],
        ]),
  ];
  return (
    <>
      <p className="eyebrow">GESTÃO SEVEN STARS</p>
      <div className="row spaced">
        <h1>Painel interno</h1>
        <span className="badge">UMA AGENDA. TODO O CONTROLE.</span>
      </div>
      <nav className="admin-tabs" aria-label="Administração">
        {navigation.map(([path, name]) => (
          <Link href={`/painelinterno${path ? "/" + path : ""}`} key={name}>
            {name}
          </Link>
        ))}
      </nav>
      <InstallPanel />
      <AdminAlerts role={data.role} />
      {children}
    </>
  );
}
