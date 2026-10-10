import Link from "next/link";
export default function Page() {
  return (
    <section className="card empty">
      <h1>Página não encontrada</h1>
      <Link className="button" href="/">
        Voltar para agendar
      </Link>
    </section>
  );
}
