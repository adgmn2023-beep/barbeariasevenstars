import { describe, it, expect } from "vitest";
import {
  availableSlots,
  availableSlotsForAnyBarber,
  canTransition,
  localDate,
} from "../src/lib/schedule";
import type { Hours, Settings, Status } from "../src/lib/types";
const now = new Date("2026-10-12T08:00:00-03:00");
const hours: Hours = {
  weekday: 1,
  closed: false,
  opens: "09:00",
  closes: "19:00",
  lunch_start: null,
  lunch_end: null,
};
const settings: Settings = {
  id: 1,
  slot_step: 20,
  min_notice: 30,
  booking_window: 30,
};
const at = (time: string) => `2026-10-12T${time}:00-03:00`;
const slots = (
  duration = 40,
  h = hours,
  busy: { start_at: string; end_at: string }[] = [],
) => availableSlots("2026-10-12", duration, h, settings, busy, now);
describe("Disponibilidade da agenda", () => {
  it("respeita a duração inteira no fim do expediente", () => {
    expect(slots(80).at(-1)).toBe(new Date(at("17:40")).toISOString());
    expect(slots(30).at(-1)).toBe(new Date(at("18:20")).toISOString());
  });
  it("exclui serviços que atravessam o almoço", () => {
    const result = slots(80, {
      ...hours,
      lunch_start: "12:00",
      lunch_end: "13:00",
    });
    expect(result).not.toContain(new Date(at("11:00")).toISOString());
    expect(result).toContain(new Date(at("10:40")).toISOString());
    expect(result).toContain(new Date(at("13:00")).toISOString());
  });
  it("bloqueia sobreposição e permite intervalos adjacentes", () => {
    const result = slots(40, hours, [
      { start_at: at("15:00"), end_at: at("16:20") },
    ]);
    expect(result).not.toContain(new Date(at("14:40")).toISOString());
    expect(result).not.toContain(new Date(at("16:00")).toISOString());
    expect(result).toContain(new Date(at("14:20")).toISOString());
    expect(result).toContain(new Date(at("16:20")).toISOString());
  });
  it("sem preferência só mostra horário se algum barbeiro couber o serviço inteiro", () => {
    const result = availableSlotsForAnyBarber(
      "2026-10-12",
      80,
      hours,
      settings,
      [
        [{ start_at: at("09:00"), end_at: at("10:00") }],
        [{ start_at: at("10:00"), end_at: at("11:00") }],
      ],
      now,
    );
    expect(result).not.toContain(new Date(at("09:00")).toISOString());
    expect(result).toContain(new Date(at("11:00")).toISOString());
  });
  it("não oferece expediente fechado ou bloqueado por inteiro", () => {
    expect(slots(40, { ...hours, closed: true })).toEqual([]);
    expect(
      slots(40, hours, [
        { start_at: at("00:00"), end_at: "2026-10-13T00:00:00-03:00" },
      ]),
    ).toEqual([]);
  });
  it("respeita antecedência mínima e passado", () => {
    const result = availableSlots(
      "2026-10-12",
      40,
      hours,
      settings,
      [],
      new Date(at("14:45")),
    );
    expect(result[0]).toBe(new Date(at("15:20")).toISOString());
    expect(availableSlots("2026-10-11", 40, hours, settings, [], now)).toEqual(
      [],
    );
  });
  it("respeita a janela em datas locais", () => {
    expect(availableSlots("2026-11-12", 40, hours, settings, [], now)).toEqual(
      [],
    );
    expect(
      availableSlots("2026-11-11", 40, hours, settings, [], now).length,
    ).toBeGreaterThan(0);
    expect(localDate(new Date("2026-10-13T01:00:00Z"))).toBe("2026-10-12");
  });
  it("não trava com grade inválida e não oferece serviço maior que expediente", () => {
    expect(
      availableSlots(
        "2026-10-12",
        40,
        hours,
        { ...settings, slot_step: 0 },
        [],
        now,
      ),
    ).toEqual([]);
    expect(slots(601)).toEqual([]);
  });
});
describe("Transições de status", () => {
  const past = "2026-10-11T18:00:00-03:00",
    future = "2026-10-13T18:00:00-03:00";
  it("permite confirmar ou cancelar um pendente", () => {
    expect(canTransition("pendente", "confirmado", future, now)).toBe(true);
    expect(canTransition("pendente", "cancelado", future, now)).toBe(true);
  });
  it("permite concluir ou marcar falta só após o atendimento", () => {
    for (const status of ["concluido", "faltou"] as Status[]) {
      expect(canTransition("confirmado", status, past, now)).toBe(true);
      expect(canTransition("confirmado", status, future, now)).toBe(false);
    }
  });
  it("impede saltos e reabertura de estados finais", () => {
    expect(canTransition("pendente", "concluido", past, now)).toBe(false);
    expect(canTransition("confirmado", "cancelado", past, now)).toBe(true);
    for (const status of ["concluido", "cancelado", "faltou"] as Status[])
      expect(canTransition(status, "confirmado", past, now)).toBe(false);
  });
});
