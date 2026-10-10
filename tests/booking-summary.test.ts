import { it, expect } from "vitest";
import { summarizeServices } from "../src/lib/booking-summary";
it("soma preços em centavos e duração de todos os serviços", () => {
  expect(
    summarizeServices([
      { price: 35.1, duration_minutes: 40 },
      { price: 24.2, duration_minutes: 30 },
    ]),
  ).toEqual({ price: 59.3, duration_minutes: 70, count: 2 });
  expect(summarizeServices([])).toEqual({
    price: 0,
    duration_minutes: 0,
    count: 0,
  });
});
