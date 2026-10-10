import { describe, expect, it } from "vitest";
import { loginEmail } from "../src/lib/phone-auth";

describe("identificador único de login", () => {
  it("normaliza telefone e converte para o e-mail técnico de cliente", () => {
    expect(loginEmail("(11) 99999-8888")).toBe(
      "5511999998888@clientes.sevenstars.invalid",
    );
    expect(loginEmail("+55 11 99999-8888")).toBe(
      "5511999998888@clientes.sevenstars.invalid",
    );
  });

  it("preserva o e-mail informado para login da equipe", () => {
    expect(loginEmail("  Dono@SevenStars.com  ")).toBe("Dono@SevenStars.com");
  });

  it("rejeita telefone sem DDD ou com tamanho inválido", () => {
    expect(() => loginEmail("12345")).toThrow();
  });
});