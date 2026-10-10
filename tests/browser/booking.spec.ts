import { test, expect } from "@playwright/test";
import { localDate } from "../../src/lib/schedule";
import { BOOKING_SUCCESS_MESSAGE } from "../../src/lib/booking-summary";
test("multisserviços, resumo móvel e cadastro rápido sem perder seleção", async ({
  page,
  isMobile,
}) => {
  const service = {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Corte Simples",
    price: 45,
    duration_minutes: 40,
    active: true,
  };
  await page.route("**/rest/v1/services?*", (route) =>
    route.fulfill({
      json: [
        service,
        {
          ...service,
          id: "66666666-6666-4666-8666-666666666666",
          name: "Barba",
          price: 25,
        },
      ],
    }),
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
  await page.route("**/rest/v1/rpc/list_active_barbers", (route) =>
    route.fulfill({
      json: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          display_name: "Barbeiro A",
        },
      ],
    }),
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
  await page.getByRole("button", { name: /Barba/ }).click();
  const summary = page.getByRole("button", {
    name: "Ver resumo do agendamento",
  });
  if (isMobile) {
    await expect(summary).toBeInViewport();
    await expect(summary).toContainText("2 serviços");
    await expect(summary).toContainText("70,00");
    await expect(summary).toContainText("80 minutos");
    await summary.click();
    const sheet = page.getByRole("dialog", { name: "Resumo do agendamento" });
    await expect(
      sheet.getByRole("listitem").filter({ hasText: "Corte Simples" }),
    ).toBeVisible();
    await expect(
      sheet.getByRole("listitem").filter({ hasText: "Barba" }),
    ).toBeVisible();
    await expect(sheet.getByText("Barbeiro A", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Fechar resumo" }).click();
  } else await expect(summary).toBeHidden();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(
    page.getByRole("heading", { name: "Escolha o barbeiro" }),
  ).toHaveCount(0);
  if (isMobile) await expect(summary).toBeInViewport();
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
  await expect(page.getByRole("heading", { name: "Seus dados" })).toBeVisible();
  if (isMobile) await expect(summary).toBeInViewport();
  await expect(page.getByLabel(/CPF|nascimento|E-mail/i)).toHaveCount(0);
  // Reload restores the service array, barber and date from selection-only storage.
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Tudo certo para o seu próximo corte?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirmar agendamento" }).click();
  await page.route("**/api/auth/cadastro-rapido", async (route) => {
    const input = route.request().postDataJSON();
    expect(input.booking.service_ids).toHaveLength(2);
    expect(input.booking.barber_id).toBe(
      "44444444-4444-4444-8444-444444444444",
    );
    expect(input.booking.start_at).toContain("T12:00:00");
    expect(Object.keys(input).sort()).toEqual([
      "booking",
      "nome",
      "password",
      "privacy_accepted",
      "telefone",
    ]);
    await route.fulfill({
      status: 201,
      json: {
        account_created: true,
        appointment: { id: "appointment", barber_name: "Barbeiro A" },
      },
    });
  });
  await page.getByLabel("Nome completo").fill("Cliente Teste");
  await page.getByLabel("Telefone com DDD").fill("11999999999");
  await page.getByLabel("Senha", { exact: true }).fill("SenhaTeste123!");
  await page.getByRole("button", { name: "Mostrar senha" }).click();
  await expect(page.getByLabel("Senha", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await page.getByRole("button", { name: "Ocultar senha" }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Criar conta e agendar" }).click();
  const success = page.getByRole("dialog", { name: "Agendamento enviado" });
  await expect(
    success.getByText(BOOKING_SUCCESS_MESSAGE, { exact: true }),
  ).toBeVisible();
  await expect(
    success.getByRole("link", { name: "Ver meus agendamentos" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => sessionStorage.getItem("seven-booking")),
  ).toBeNull();
  expect(
    await page.evaluate(() =>
      JSON.stringify({ ...sessionStorage, ...localStorage }),
    ),
  ).not.toContain("SenhaTeste123!");
});

test("sem preferência oculta horário em que nenhum barbeiro comporta o serviço", async ({
  page,
}) => {
  const service = {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Corte Completo",
    price: 60,
    duration_minutes: 80,
    active: true,
  };
  const barberA = "44444444-4444-4444-8444-444444444444";
  const barberB = "55555555-5555-4555-8555-555555555555";
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
        lunch_start: null,
        lunch_end: null,
      })),
    }),
  );
  await page.route("**/rest/v1/settings?*", (route) =>
    route.fulfill({
      json: { id: 1, slot_step: 20, min_notice: 30, booking_window: 30 },
    }),
  );
  await page.route("**/rest/v1/rpc/list_active_barbers", (route) =>
    route.fulfill({
      json: [
        { id: barberA, display_name: "Barbeiro A" },
        { id: barberB, display_name: "Barbeiro B" },
      ],
    }),
  );
  await page.route("**/rest/v1/rpc/get_busy_ranges", async (route) => {
    const { p_barber_id, p_date } = route.request().postDataJSON() as {
      p_barber_id: string;
      p_date: string;
    };
    const block =
      p_barber_id === barberA
        ? {
            start_at: `${p_date}T09:00:00-03:00`,
            end_at: `${p_date}T10:00:00-03:00`,
          }
        : {
            start_at: `${p_date}T10:00:00-03:00`,
            end_at: `${p_date}T11:00:00-03:00`,
          };
    await route.fulfill({ json: [block] });
  });
  await page.goto("/");
  test.skip(
    await page
      .getByText("Em breve, agendamentos por aqui.", { exact: false })
      .isVisible(),
    "Este cenário requer um build com configuração pública Supabase.",
  );
  await page.getByRole("button", { name: /Corte Completo/ }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: /Sem preferência/ }).click();
  await page.getByRole("button", { name: /Escolher horário/ }).click();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  await page.getByLabel("Escolha o dia").fill(localDate(tomorrow));
  await expect(
    page.getByRole("button", { name: "09:00", exact: true }),
  ).toHaveCount(0);
});
