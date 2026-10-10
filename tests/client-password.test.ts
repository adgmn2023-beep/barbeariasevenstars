import { beforeEach, describe, it, expect, vi } from "vitest";
const mock = vi.hoisted(() => ({
  authorize: vi.fn(),
  from: vi.fn(),
  updateAuth: vi.fn(),
  changeAuth: vi.fn(),
  writes: [] as { table: string; value: unknown }[],
  role: "client",
  clientId: "33333333-3333-4333-8333-333333333333",
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin", () => ({ requireAdmin: mock.authorize }));
vi.mock("@/lib/supabase/server", () => ({
  privilegedDb: () => ({
    from: mock.from,
    auth: { admin: { updateUserById: mock.updateAuth } },
  }),
  serverDb: async () => ({
    from: mock.from,
    auth: {
      getUser: async () => ({ data: { user: { id: mock.clientId } } }),
      updateUser: mock.changeAuth,
    },
  }),
}));
import { POST as reset } from "../src/app/api/admin/clientes/[id]/senha/route";
import { POST as change } from "../src/app/api/conta/trocar-senha/route";
beforeEach(() => {
  vi.clearAllMocks();
  mock.writes = [];
  mock.role = "client";
  mock.authorize.mockResolvedValue({ user: { id: "admin" } });
  mock.updateAuth.mockResolvedValue({ error: null });
  mock.changeAuth.mockResolvedValue({ error: null });
  mock.from.mockImplementation((table: string) => ({
    select: () => ({
      eq: () => ({
        single: async () => ({
          data: { id: mock.clientId, role: mock.role },
          error: null,
        }),
      }),
    }),
    update: (value: unknown) => {
      mock.writes.push({ table, value });
      return { eq: async () => ({ error: null }) };
    },
    insert: async (value: unknown) => {
      mock.writes.push({ table, value });
      return { error: null };
    },
  }));
});
describe("Senha provisória de clientes", () => {
  it("envia a senha só ao Auth e a exibe em resposta sem cache, persistindo apenas flag e auditoria", async () => {
    const log = vi.spyOn(console, "log");
    const error = vi.spyOn(console, "error");
    try {
      const response = await reset(new Request("http://localhost"), {
        params: Promise.resolve({ id: mock.clientId }),
      });
      const { provisionalPassword } = await response.json();
      expect(provisionalPassword.length).toBeGreaterThanOrEqual(12);
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(mock.updateAuth).toHaveBeenCalledWith(mock.clientId, {
        password: provisionalPassword,
      });
      expect(mock.writes).toEqual([
        { table: "profiles", value: { must_change_password: true } },
        {
          table: "audit_log",
          value: {
            actor_profile_id: "admin",
            target_profile_id: mock.clientId,
            action: "client_password_reset",
          },
        },
      ]);
      expect(
        JSON.stringify([mock.writes, log.mock.calls, error.mock.calls]),
      ).not.toContain(provisionalPassword);
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
  });
  it("não redefine se o controle de acesso negar ou o alvo for equipe", async () => {
    mock.authorize.mockRejectedValueOnce(new Error("Sem permissão"));
    expect(
      (
        await reset(new Request("http://localhost"), {
          params: Promise.resolve({ id: mock.clientId }),
        })
      ).status,
    ).toBe(400);
    expect(mock.from).not.toHaveBeenCalled();
    mock.role = "admin";
    expect(
      (
        await reset(new Request("http://localhost"), {
          params: Promise.resolve({ id: mock.clientId }),
        })
      ).status,
    ).toBe(404);
    expect(mock.updateAuth).not.toHaveBeenCalled();
  });
  it("aceita oito caracteres para cliente e limpa só a flag, preservando exclusão de conta", async () => {
    const password = "Nova123!";
    const response = await change(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ password }),
      }),
    );
    expect(response.status).toBe(200);
    expect(mock.changeAuth).toHaveBeenCalledWith({ password });
    expect(mock.writes).toEqual([
      { table: "profiles", value: { must_change_password: false } },
    ]);
    expect(await response.text()).not.toContain(password);
  });
  it("não retorna erro bruto do Auth nem limpa a flag se a alteração falhar", async () => {
    const password = "NaoExpor123!";
    mock.changeAuth.mockResolvedValue({ error: { message: password } });
    const response = await change(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ password }),
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain(password);
    expect(mock.writes).toEqual([]);
  });
});
