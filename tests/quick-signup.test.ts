import { beforeEach, describe, it, expect, vi } from "vitest";
const mock = vi.hoisted(() => ({
  limit: vi.fn(),
  rpc: vi.fn(),
  createUser: vi.fn(),
  signIn: vi.fn(),
  book: vi.fn(),
  cookieSession: false,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth-rate-limit", () => ({
  enforceAuthRateLimit: mock.limit,
  AuthRequestError: class extends Error {
    constructor(
      message: string,
      public status = 400,
      public code = "AUTH_ERROR",
    ) {
      super(message);
    }
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  privilegedDb: () => ({
    rpc: mock.rpc,
    auth: { admin: { createUser: mock.createUser } },
  }),
  serverDb: async () => ({ auth: { signInWithPassword: mock.signIn } }),
}));
vi.mock("@/lib/booking-server", () => ({ createBooking: mock.book }));
import { POST } from "../src/app/api/auth/cadastro-rapido/route";
import { technicalEmail, PHONE_EXISTS_MESSAGE } from "../src/lib/phone-auth";
const password = "SenhaSomenteAuth123!";
const payload = {
  nome: "Cliente Teste",
  telefone: "(21) 99999-9999",
  password,
  privacy_accepted: true,
  booking: {
    service_ids: ["33333333-3333-4333-8333-333333333333"],
    start_at: "2026-12-01T12:00:00Z",
    barber_id: null,
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  mock.cookieSession = false;
  mock.limit.mockResolvedValue(undefined);
  mock.rpc.mockResolvedValue({ data: [], error: null });
  mock.createUser.mockResolvedValue({
    data: { user: { id: "new-client" } },
    error: null,
  });
  mock.signIn.mockImplementation(async () => {
    mock.cookieSession = true;
    return { data: { session: { access_token: "session-only" } }, error: null };
  });
  mock.book.mockImplementation(async () => {
    expect(mock.cookieSession).toBe(true);
    return { id: "appointment", barber_name: "Barbeiro" };
  });
});
const request = (body = payload) =>
  new Request("http://localhost/api/auth/cadastro-rapido", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
describe("Cadastro rápido no servidor", () => {
  it("cria usuário Auth, ativa sessão e reserva a seleção sem nascimento ou e-mail", async () => {
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect((await response.json()).appointment.id).toBe("appointment");
    expect(mock.signIn).toHaveBeenCalledWith({
      email: "5521999999999@clientes.sevenstars.invalid",
      password,
    });
    expect(mock.book).toHaveBeenCalledWith(expect.anything(), payload.booking);
  });
  it("telefone normalizado duplicado abre login sem criar conta ou reservar", async () => {
    mock.rpc.mockResolvedValue({ data: [{ id: "existing" }], error: null });
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "PHONE_EXISTS",
      error: PHONE_EXISTS_MESSAGE,
    });
    expect(mock.createUser).not.toHaveBeenCalled();
    expect(mock.book).not.toHaveBeenCalled();
    expect(technicalEmail("+55 (21) 99999-9999")).toBe(
      "5521999999999@clientes.sevenstars.invalid",
    );
  });
  it("nunca copia senha para metadados, RPC, resposta ou logs", async () => {
    const errorLog = vi.spyOn(console, "error");
    const infoLog = vi.spyOn(console, "log");
    const response = await POST(
      request({
        ...payload,
        ...{ role: "master", senha: password },
      } as typeof payload),
    );
    const result = await response.json();
    const authInput = mock.createUser.mock.calls[0][0];
    expect(authInput.user_metadata).toEqual({
      nome: "Cliente Teste",
      telefone: "21999999999",
      privacy_accepted: true,
    });
    expect(
      JSON.stringify([
        authInput.user_metadata,
        mock.rpc.mock.calls,
        mock.book.mock.calls,
        result,
        errorLog.mock.calls,
        infoLog.mock.calls,
      ]),
    ).not.toContain(password);
    errorLog.mockRestore();
    infoLog.mockRestore();
  });
  it("se a agenda ocupou, mantém a sessão e permite escolher outro horário", async () => {
    mock.book.mockRejectedValue({
      code: "P0001",
      message: "Esse horário acabou de ser ocupado, escolha outro.",
    });
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      account_created: true,
      appointment: null,
      booking_error: "Esse horário acabou de ser ocupado, escolha outro.",
    });
    expect(mock.cookieSession).toBe(true);
  });
  it("erros do provedor não vazam conteúdo de senha e cadastro respeita rate limit", async () => {
    mock.createUser.mockResolvedValue({
      data: { user: null },
      error: { message: password, code: "unknown" },
    });
    const response = await POST(request());
    expect(await response.text()).not.toContain(password);
    expect(mock.limit).toHaveBeenCalledWith(expect.any(Request), "signup");
    expect(mock.signIn).not.toHaveBeenCalled();
  });
});
