"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  Scissors,
  UserRound,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { browserDb, configured } from "@/lib/supabase/client";
export function Shell({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState(false);
  const [admin, setAdmin] = useState(false);
  const path = usePathname();
  useEffect(() => {
    if (!configured()) return;
    const db = browserDb();
    const load = async () => {
      const {
        data: { user },
      } = await db.auth.getUser();
      setUser(!!user);
      if (user) {
        const { data } = await db
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();
        setAdmin(["barber", "admin", "master"].includes(data?.role ?? ""));
      } else setAdmin(false);
    };
    void load();
    const { data } = db.auth.onAuthStateChange(() => {
      setTimeout(() => void load(), 0);
    });
    window.addEventListener("seven-auth-changed", load);
    return () => {
      window.removeEventListener("seven-auth-changed", load);
      data.subscription.unsubscribe();
    };
  }, []);
  const links = [
    { href: "/", label: "Agendar", icon: Scissors },
    { href: "/meus-agendamentos", label: "Meus horários", icon: CalendarDays },
    { href: "/perfil", label: "Meu perfil", icon: UserRound },
  ];
  return (
    <>
      <header className="header">
        <Link href="/" className="brand">
          <Image
            src="/logo.png"
            alt="Seven Stars Barbershop"
            width={64}
            height={64}
            priority
          />
          <span>
            SEVEN STARS<small>BARBERSHOP</small>
          </span>
        </Link>
        <nav className="desktop-nav" aria-label="Principal">
          {links.map((l) => (
            <Link
              aria-current={path === l.href ? "page" : undefined}
              key={l.href}
              href={l.href}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="header-actions">
          {admin && (
            <Link href="/painelinterno" aria-label="Painel interno">
              <ShieldCheck size={21} />
            </Link>
          )}
          {user ? (
            <button
              className="quiet"
              onClick={async () => {
                await browserDb().auth.signOut();
                location.assign("/");
              }}
              aria-label="Sair"
            >
              <LogOut size={20} />
            </button>
          ) : (
            <Link className="button outline" href="/login">
              Entrar <UserRound size={16} />
            </Link>
          )}
        </div>
      </header>
      <main className="container">{children}</main>
      <footer>
        SEVEN STARS BARBERSHOP <span>Seu estilo merece esse cuidado.</span>
        <Link href="/privacidade">Privacidade</Link>
      </footer>
      <nav className="mobile-nav" aria-label="Navegação no celular">
        {links.map((l) => (
          <Link
            key={l.href}
            aria-current={path === l.href ? "page" : undefined}
            href={l.href}
          >
            <l.icon size={20} />
            {l.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
