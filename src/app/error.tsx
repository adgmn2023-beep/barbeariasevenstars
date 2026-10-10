"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="card empty">
      <h1>Não foi possível carregar esta tela</h1>
      <p>Verifique sua conexão e tente novamente.</p>
      <button className="button" onClick={reset}>
        Tentar novamente
      </button>
    </section>
  );
}
