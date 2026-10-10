import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.route("**/rest/v1/services?*", (route) =>
    route.fulfill({
      json: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          name: "Corte Simples",
          price: 45,
          duration_minutes: 40,
          active: true,
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
        { id: "44444444-4444-4444-8444-444444444444", display_name: "Barbeiro A" },
      ],
    }),
  );
});
test("página inicial, serviços e seleção sem transbordar", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Seu estilo. Seu momento." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Corte Simples/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Corte Simples/ }).click();
  await expect(
    page.getByRole("button", { name: /Corte Simples/ }),
  ).toHaveAttribute("aria-pressed", "true");
  const button = page.getByRole("button", { name: "Continuar" });
  if (
    await page
      .getByText("Em breve, agendamentos por aqui.", { exact: false })
      .isVisible()
  )
    await expect(button).toBeDisabled();
  else await expect(button).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: `test-results/home-${test.info().project.name}.png`,
    fullPage: true,
  });
});
test("autenticação, política e proteção do painel", async ({ page }) => {
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Bem-vindo de volta" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Criar uma conta" }).click();
  await expect(page.getByLabel("Telefone com DDD")).toBeVisible();
  await page.getByLabel("Telefone com DDD").fill("11999999999");
  await expect(page.getByLabel("Telefone com DDD")).toHaveValue(
    "(11) 99999-9999",
  );
  await page
    .getByRole("link", { name: "política de privacidade", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Política de privacidade" }),
  ).toBeVisible();
  await page.goto("/painelinterno");
  await expect(page).toHaveURL(/\/login/);
});
test("pula a escolha de barbeiro quando há apenas um ativo", async ({ page }) => {
  await page.goto("/");
  test.skip(
    await page.getByText("Em breve, agendamentos por aqui.", { exact: false }).isVisible(),
    "Este cenário requer configuração pública Supabase.",
  );
  await page.getByRole("button", { name: /Corte Simples/ }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByLabel("Escolha o dia")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Escolha o barbeiro" })).toHaveCount(0);
});
test("manifesto, service worker e tela offline", async ({
  page,
  context,
  request,
}) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  const data = await manifest.json();
  expect(data.icons).toHaveLength(3);
  for (const icon of data.icons)
    expect((await request.get(icon.src)).ok()).toBe(true);
  const adminManifest = await request.get(
    "/painelinterno/manifest.webmanifest",
  );
  expect(adminManifest.ok()).toBe(true);
  const adminData = await adminManifest.json();
  expect(adminData).toMatchObject({
    name: "Seven Stars Admin",
    short_name: "Painel",
    start_url: "/painelinterno",
    scope: "/painelinterno",
    display: "standalone",
  });
  expect(adminData.icons).toEqual(data.icons);
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await page.goto("/offline-check");
  await expect(
    page.getByRole("heading", { name: "Você está sem conexão" }),
  ).toBeVisible();
  await context.setOffline(false);
});
