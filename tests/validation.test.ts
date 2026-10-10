import { describe, it, expect } from "vitest";
import { safeNext, statusSchema, profileSchema } from "../src/lib/validation";
describe("Validação de entradas", () => {
  it("recusa redirecionamentos externos e variantes com caracteres de controle", () => {
    for (const value of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "/\t/evil.example",
      "/\n/evil.example",
      null,
    ])
      expect(safeNext(value)).toBe("/");
    expect(safeNext("/perfil?next=/")).toBe("/perfil?next=/");
  });
  it("exige motivo de cancelamento útil", () => {
    expect(
      statusSchema.safeParse({ status: "cancelado", cancel_reason: "  " })
        .success,
    ).toBe(false);
    expect(
      statusSchema.safeParse({
        status: "cancelado",
        cancel_reason: "Sem expediente",
      }).success,
    ).toBe(true);
  });
  it("exige consentimento e telefone com DDD", () => {
    const p = {
      nome: "Cliente Teste",
      telefone: "(11) 99999-9999",
      data_nascimento: "1990-01-01",
      privacy_accepted: true,
    };
    expect(profileSchema.parse(p).telefone).toBe("11999999999");
    expect(
      profileSchema.safeParse({ ...p, privacy_accepted: false }).success,
    ).toBe(false);
    expect(profileSchema.safeParse({ ...p, telefone: "123" }).success).toBe(
      false,
    );
  });
});
