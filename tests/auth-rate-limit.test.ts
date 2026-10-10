import { afterEach, beforeEach, it, expect, vi } from "vitest";
const mock = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  privilegedDb: () => ({ rpc: mock.rpc }),
}));
import { enforceAuthRateLimit } from "../src/lib/auth-rate-limit";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only-hmac-key");
  mock.rpc.mockResolvedValue({ data: true, error: null });
});
afterEach(() => vi.unstubAllEnvs());
it("usa buckets por IP confiável sem armazenar IP ou senha", async () => {
  vi.stubEnv("VERCEL", "1");
  for (const ip of ["192.0.2.1", "192.0.2.2"])
    await enforceAuthRateLimit(
      new Request("http://localhost", { headers: { "x-forwarded-for": ip } }),
      "signup",
    );
  const [first, second] = mock.rpc.mock.calls.map((call) => call[1]);
  expect(first).toEqual({
    p_bucket: expect.stringMatching(/^[a-f0-9]{64}$/),
    p_limit: 5,
    p_window_seconds: 900,
  });
  expect(first.p_bucket).not.toBe(second.p_bucket);
  expect(JSON.stringify(mock.rpc.mock.calls)).not.toContain("192.0.2.");
});
it("não permite contornar o limite fora da Vercel falsificando cabeçalhos", async () => {
  vi.stubEnv("VERCEL", "");
  for (const ip of ["192.0.2.1", "192.0.2.2"])
    await enforceAuthRateLimit(
      new Request("http://localhost", { headers: { "x-forwarded-for": ip } }),
      "signup",
    );
  expect(mock.rpc.mock.calls[0][1]).toEqual(mock.rpc.mock.calls[1][1]);
});
it("bloqueia excesso e falha fechada se o armazenamento do limite falhar", async () => {
  mock.rpc.mockResolvedValueOnce({ data: false, error: null });
  await expect(
    enforceAuthRateLimit(new Request("http://localhost"), "signup"),
  ).rejects.toMatchObject({ status: 429, code: "RATE_LIMITED" });
  mock.rpc.mockResolvedValueOnce({
    data: null,
    error: { message: "internal" },
  });
  await expect(
    enforceAuthRateLimit(new Request("http://localhost"), "signup"),
  ).rejects.toMatchObject({ status: 503 });
});
