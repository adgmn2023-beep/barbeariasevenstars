import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { readFileSync, readdirSync } from "node:fs";
let db: PGlite;
const alice = "11111111-1111-4111-8111-111111111111",
  bob = "22222222-2222-4222-8222-222222222222";
let service: string, day: string;
async function asUser(id: string) {
  await db.exec(
    `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`,
  );
}
async function asOwner() {
  await db.exec("reset role;");
}
async function book(time: string) {
  return db.query<{ id: string }>(
    "select create_appointment($1,$2::timestamptz) as id",
    [service, `${day}T${time}:00-03:00`],
  );
}
beforeAll(async () => {
  db = new PGlite({ extensions: { btree_gist } });
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;create publication supabase_realtime;`,
  );
  for (const name of readdirSync("supabase/migrations")
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${name}`, "utf8"));
  await db.query(
    `insert into auth.users(id,email,raw_user_meta_data) values($1,'alice@example.com',$3::jsonb),($2,'bob@example.com',$3::jsonb)`,
    [
      alice,
      bob,
      JSON.stringify({
        nome: "Cliente Teste",
        telefone: "11999999999",
        data_nascimento: "1990-01-01",
        privacy_accepted: true,
        role: "admin",
      }),
    ],
  );
  service = (await db.query<{ id: string }>("select id from services limit 1"))
    .rows[0].id;
  day = (
    await db.query<{ day: string }>(
      `select to_char((now() at time zone 'America/Sao_Paulo')::date + ((8-extract(dow from now() at time zone 'America/Sao_Paulo')::int)%7+1),'YYYY-MM-DD') as day`,
    )
  ).rows[0].day;
  // Todos os dias abertos para tornar os testes independentes do calendário do host.
  await db.exec(
    `update business_hours set closed=false,opens='09:00',closes='19:00';`,
  );
});
afterAll(async () => {
  await db?.close();
});
describe("Regras reais no PostgreSQL e RLS", () => {
  it("cadastro ignora role enviada pelo usuário", async () => {
    const result = await db.query<{ role: string }>(
      "select role from profiles where id=$1",
      [alice],
    );
    expect(result.rows[0].role).toBe("client");
  });
  it("RLS restringe perfis e bloqueia promoção", async () => {
    await asUser(alice);
    expect((await db.query("select * from profiles")).rows).toHaveLength(1);
    await expect(
      db.exec(`update profiles set role='admin' where id='${alice}'`),
    ).rejects.toThrow(/permission denied/);
  });
  it("bloqueia INSERT direto e concede apenas RPC", async () => {
    await expect(
      db.exec(
        `insert into appointments(service_name,price,duration_minutes,start_at,end_at,booking_date) values('Teste',0,40,now(),now()+interval '40 min',current_date)`,
      ),
    ).rejects.toThrow(/permission denied/);
    const result = await book("09:00");
    expect(result.rows[0].id).toBeTruthy();
  });
  it("impede segundo agendamento do mesmo cliente no dia", async () => {
    await expect(book("11:00")).rejects.toThrow(/própria conta/);
  });
  it("outro cliente não lê a reserva e não sobrepõe intervalo", async () => {
    await asUser(bob);
    expect((await db.query("select * from appointments")).rows).toHaveLength(0);
    await expect(book("09:20")).rejects.toThrow(/acabou de ser ocupado/);
  });
  it("disponibilidade pública contém somente início e fim", async () => {
    await db.exec("reset role;set role anon;");
    const result = await db.query("select * from get_busy_ranges($1::date)", [
      day,
    ]);
    expect(Object.keys(result.rows[0] as object).sort()).toEqual([
      "end_at",
      "start_at",
    ]);
    await expect(db.exec("select * from profiles")).rejects.toThrow(
      /permission denied/,
    );
  });
  it("bloqueios não podem invadir agendamentos", async () => {
    await asOwner();
    await expect(
      db.query("insert into blocked_slots(start_at,end_at) values($1,$2)", [
        `${day}T09:00:00-03:00`,
        `${day}T10:00:00-03:00`,
      ]),
    ).rejects.toThrow(/conflita/);
    await db.query("insert into blocked_slots(start_at,end_at) values($1,$2)", [
      `${day}T12:00:00-03:00`,
      `${day}T13:00:00-03:00`,
    ]);
    await asUser(bob);
    await expect(book("11:40")).rejects.toThrow(/bloqueado/);
  });
  it("valida grade, expediente, duração e almoço", async () => {
    await expect(book("10:01")).rejects.toThrow(/grade/);
    await expect(book("18:40")).rejects.toThrow(/expediente/);
    await asOwner();
    await db.exec(
      `update business_hours set lunch_start='14:00',lunch_end='15:00'`,
    );
    await asUser(bob);
    await expect(book("13:40")).rejects.toThrow(/almoço/);
  });
  it("cancelamento exige motivo e libera dia e horário", async () => {
    await asOwner();
    await expect(
      db.exec(`update appointments set status='cancelado'`),
    ).rejects.toThrow(/check constraint/);
    await db.exec(
      `update appointments set status='cancelado',cancel_reason='Solicitação do cliente'`,
    );
    await asUser(alice);
    expect((await book("09:00")).rows).toHaveLength(1);
  });
  it("snapshot não muda ao editar serviço", async () => {
    await asOwner();
    await db.query(
      "update services set price=123,duration_minutes=80 where id=$1",
      [service],
    );
    const result = await db.query<{ price: string; duration_minutes: number }>(
      `select price,duration_minutes from appointments where status='pendente'`,
    );
    expect(Number(result.rows[0].price)).toBe(0);
    expect(result.rows[0].duration_minutes).toBe(40);
  });
  it("impede concluir pendente e concluir confirmado antes do fim", async () => {
    await expect(
      db.exec(
        `update appointments set status='concluido' where status='pendente'`,
      ),
    ).rejects.toThrow(/status/);
    await db.exec(
      `update appointments set status='confirmado' where status='pendente'`,
    );
    await expect(
      db.exec(
        `update appointments set status='concluido' where status='confirmado'`,
      ),
    ).rejects.toThrow(/status/);
  });
  it("nega RPC de exclusão a cliente", async () => {
    await asUser(alice);
    await expect(
      db.query("select erase_account_data($1)", [bob]),
    ).rejects.toThrow(/permission denied/);
  });
  it("exclui conta e anonimiza somente concluídos", async () => {
    await asOwner();
    await db.query(
      `insert into appointments(client_id,service_name,price,duration_minutes,start_at,end_at,booking_date,status) values($1,'Histórico',50,40,now()-interval '2 days',now()-interval '2 days'+interval '40 min',(now()-interval '2 days')::date,'concluido')`,
      [alice],
    );
    await db.query("select erase_account_data($1)", [alice]);
    expect(
      (await db.query("select * from auth.users where id=$1", [alice])).rows,
    ).toHaveLength(0);
    const result = await db.query<{ client_id: string | null; status: string }>(
      "select client_id,status from appointments",
    );
    expect(result.rows).toEqual([{ client_id: null, status: "concluido" }]);
  });
});
