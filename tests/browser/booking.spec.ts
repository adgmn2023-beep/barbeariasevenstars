import { test, expect } from "@playwright/test";
import { localDate } from "../../src/lib/schedule";
test("reserva pública preservada ao entrar e voltar", async ({ page }) => {
  const service = {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Corte Simples",
    price: 45,
    duration_minutes: 80,
    active: true,
  };
  await page.route("**/rest/v1/services?*", (route) =>
    route.fulfill({ json: [service] }),
  );
  await page.route("**/rest/v1/business_hours?*", (route) =>
    route.fulfill({
      json: Array.from({ length: 7 }, (_, weekday) => ({
        weekday,
        closed: false,
        opens: "09:00:00",
        closes: "19:00:00",
        lunch_start: "12:00:00",
        lunch_end: "13:00:00",
      })),
    }),
  );
  await page.route("**/rest/v1/settings?*", (route) =>
    route.fulfill({
      json: { id: 1, slot_step: 20, min_notice: 30, booking_window: 30 },
    }),
  );
  await page.route("**/rest/v1/rpc/get_busy_ranges", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: /Corte Simples/ }),
  ).toBeVisible();
  test.skip(
    await page
      .getByText("Em breve, agendamentos por aqui.", { exact: false })
      .isVisible(),
    "Este cenário requer um build com URL/chave pública Supabase; os dados são interceptados e não criam reservas reais.",
  );
  await page.getByRole("button", { name: /Corte Simples/ }).click();
  await page.getByRole("button", { name: "Escolher horário" }).click();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  await page.getByLabel("Escolha o dia").fill(localDate(tomorrow));
  await page.getByRole("button", { name: "09:00", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "11:00", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "18:00", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Revisar reserva" }).click();
  await expect(
    page.getByRole("heading", { name: "Tudo certo para o seu próximo corte?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirmar agendamento" }).click();
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByRole("link", { name: "Criar uma conta" }).click();
  await expect(page).toHaveURL(/\/cadastro\?next=/);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Tudo certo para o seu próximo corte?" }),
  ).toBeVisible();
});
