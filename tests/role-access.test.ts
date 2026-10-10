import { describe, expect, it } from "vitest";
import { canAccessPanel, canCreateTeamRole } from "../src/lib/role-access";

describe("permissões do painel e da equipe", () => {
  it("cliente não entra no painel e barbeiro inativo também não", () => {
    expect(canAccessPanel("client")).toBe(false);
    expect(canAccessPanel("barber", false)).toBe(false);
    expect(canAccessPanel("barber", true)).toBe(true);
  });

  it("admin não cria admin; master pode criar admin e barbeiro", () => {
    expect(canCreateTeamRole("admin", "admin")).toBe(false);
    expect(canCreateTeamRole("admin", "barber")).toBe(true);
    expect(canCreateTeamRole("master", "admin")).toBe(true);
    expect(canCreateTeamRole("master", "barber")).toBe(true);
  });
});