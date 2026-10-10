"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Clipboard, KeyRound, UserPlus } from "lucide-react";

type Member = {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  role: "barber" | "admin" | "master";
  active: boolean;
  must_change_password: boolean;
  barber: { id: string; display_name: string; active: boolean } | null;
};

type TeamResponse = { members?: Member[]; error?: string };
type Credential = { name: string; password: string };

export function TeamManagement({ isMaster }: { isMaster: boolean }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [role, setRole] = useState<"barber" | "admin">("barber");
  const [alsoBarber, setAlsoBarber] = useState(true);
  const [credential, setCredential] = useState<Credential | null>(null);
  const [selected, setSelected] = useState<Member | null>(null);
  const [strategy, setStrategy] = useState<"cancel" | "reassign">("cancel");
  const [reassignTo, setReassignTo] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/equipe", { cache: "no-store" });
      const result = (await response.json()) as TeamResponse;
      if (!response.ok) throw new Error(result.error ?? "Falha ao carregar equipe.");
      setMembers(result.members ?? []);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar equipe.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (selected && !dialog.current?.open) dialog.current?.showModal();
  }, [selected]);

  async function send(action: string, body: Record<string, unknown>) {
    const response = await fetch("/api/admin/equipe", {
      method: action === "create" ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = (await response.json()) as TeamResponse & {
      provisionalPassword?: string;
      member?: { nome: string };
    };
    if (!response.ok) throw new Error(result.error ?? "A operação falhou.");
    return result;
  }

  async function createMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    setBusy(true);
    setError("");
    setMessage("");
    setCredential(null);
    try {
      const result = await send("create", {
        nome: values.nome,
        email: values.email,
        telefone: values.telefone,
        role,
        alsoBarber: role === "barber" || alsoBarber,
      });
      if (!result.provisionalPassword)
        throw new Error("A senha provisória não foi retornada.");
      setCredential({
        name: result.member?.nome ?? String(values.nome),
        password: result.provisionalPassword,
      });
      form.reset();
      setRole("barber");
      setAlsoBarber(true);
      setMessage("Usuário criado. Copie a senha provisória agora; ela não será exibida novamente.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao criar usuário.");
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(member: Member) {
    setBusy(true);
    setError("");
    setCredential(null);
    try {
      const result = await send("reset_password", {
        action: "reset_password",
        id: member.id,
      });
      if (!result.provisionalPassword)
        throw new Error("A senha provisória não foi retornada.");
      setCredential({ name: member.nome, password: result.provisionalPassword });
      setMessage("Senha redefinida. Copie-a agora; ela não será exibida novamente.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao redefinir senha.");
    } finally {
      setBusy(false);
    }
  }

  async function setActive(member: Member, active: boolean) {
    setBusy(true);
    setError("");
    try {
      await send(active ? "reactivate" : "deactivate", {
        action: active ? "reactivate" : "deactivate",
        id: member.id,
        ...(member.barber?.active
          ? {
              strategy,
              reassign_to: strategy === "reassign" ? reassignTo : null,
              cancel_reason: strategy === "cancel" ? cancelReason : undefined,
            }
          : {}),
      });
      dialog.current?.close();
      setSelected(null);
      setCancelReason("");
      setReassignTo("");
      setMessage(active ? "Acesso reativado." : "Acesso desativado.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao atualizar acesso.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="team-management" aria-labelledby="team-heading">
      <div className="section-head">
        <p className="eyebrow">ACESSOS E OPERAÇÃO</p>
        <h2 id="team-heading">Equipe</h2>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
      <section className="card">
        <h3><UserPlus size={18} aria-hidden="true" /> Criar usuário</h3>
        <form className="team-create-form" onSubmit={createMember}>
          <label>Nome<input name="nome" autoComplete="name" required minLength={2} /></label>
          <label>E-mail<input name="email" type="email" autoComplete="email" required /></label>
          <label>Telefone<input name="telefone" type="tel" autoComplete="tel" required /></label>
          <label>
            Papel
            <select value={role} onChange={(event) => setRole(event.target.value as "barber" | "admin")}>
              <option value="barber">Barbeiro</option>
              {isMaster && <option value="admin">Admin</option>}
            </select>
          </label>
          {role === "admin" && (
            <label className="check team-checkbox">
              <input type="checkbox" checked={alsoBarber} onChange={(event) => setAlsoBarber(event.target.checked)} />
              Também atende como barbeiro
            </label>
          )}
          <button className="button" disabled={busy}>
            {busy ? "Criando…" : "Criar usuário"}
          </button>
        </form>
        {credential && (
          <div className="team-credential" role="status">
            <div>
              <strong>Senha provisória de {credential.name}</strong>
              <p>Ela será solicitada no primeiro acesso e não pode ser recuperada aqui.</p>
            </div>
            <code>{credential.password}</code>
            <button
              className="button outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(credential.password);
                  setMessage("Senha copiada.");
                } catch {
                  setError("Não foi possível copiar. Selecione a senha e copie manualmente.");
                }
              }}
            >
              <Clipboard size={16} aria-hidden="true" /> Copiar senha
            </button>
            <button className="quiet" onClick={() => setCredential(null)}>Ocultar</button>
          </div>
        )}
      </section>

      <section className="team-list" aria-labelledby="team-list-heading">
        <h3 id="team-list-heading">Acessos da equipe</h3>
        {loading ? (
          <p role="status">Carregando equipe…</p>
        ) : members.length ? (
          members.map((member) => (
            <article className="card team-member" key={member.id}>
              <div className="team-member-info">
                <strong>{member.nome || "Sem nome"}</strong>
                <span>{member.email}</span>
                <span>{member.role === "master" ? "Master" : member.role === "admin" ? "Admin" : "Barbeiro"}</span>
                {member.barber && (
                  <span>Atende como barbeiro · {member.barber.active ? "agenda ativa" : "agenda inativa"}</span>
                )}
                {member.must_change_password && <span className="muted">Troca de senha pendente</span>}
              </div>
              <span className={`badge ${member.active ? "status-confirmado" : "status-cancelado"}`}>
                {member.active ? "Ativo" : "Inativo"}
              </span>
              <div className="team-member-actions">
                <button className="button outline" disabled={busy || member.role === "master"} onClick={() => void resetPassword(member)}>
                  <KeyRound size={16} aria-hidden="true" /> Redefinir senha
                </button>
                {member.role !== "master" && (
                  <button
                    className={`button ${member.active ? "outline danger" : "outline"}`}
                    disabled={busy}
                    onClick={() => member.active ? setSelected(member) : void setActive(member, true)}
                  >
                    {member.active ? "Desativar" : "Reativar"}
                  </button>
                )}
              </div>
            </article>
          ))
        ) : <p className="card empty">Nenhum usuário de equipe cadastrado.</p>}
      </section>

      <dialog ref={dialog} className="card cancel-dialog" onClose={() => setSelected(null)} onClick={(event) => {
        if (event.target === event.currentTarget) dialog.current?.close();
      }}>
        {selected && (
          <>
            <h2>Desativar {selected.nome}?</h2>
            <p>A conta será bloqueada no Supabase Auth.</p>
            {selected.barber?.active && (
              <>
                <label>
                  Destino dos agendamentos futuros
                  <select value={strategy} onChange={(event) => setStrategy(event.target.value as "cancel" | "reassign")}>
                    <option value="cancel">Cancelar com motivo</option>
                    <option value="reassign">Remanejar</option>
                  </select>
                </label>
                {strategy === "cancel" ? (
                  <label>Motivo<textarea minLength={3} maxLength={500} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} required /></label>
                ) : (
                  <label>
                    Remanejar para
                    <select value={reassignTo} onChange={(event) => setReassignTo(event.target.value)} required>
                      <option value="">Selecione um barbeiro ativo</option>
                      {members.filter((candidate) => candidate.id !== selected.id && candidate.active && candidate.barber?.active).map((candidate) => (
                        <option key={candidate.barber!.id} value={candidate.barber!.id}>{candidate.barber!.display_name}</option>
                      ))}
                    </select>
                  </label>
                )}
              </>
            )}
            <div className="row">
              <button className="button outline" onClick={() => dialog.current?.close()}>Voltar</button>
              <button className="button danger" disabled={busy || (selected.barber?.active && (strategy === "cancel" ? cancelReason.trim().length < 3 : !reassignTo))} onClick={() => void setActive(selected, false)}>
                {busy ? "Desativando…" : "Confirmar desativação"}
              </button>
            </div>
          </>
        )}
      </dialog>
    </section>
  );
}