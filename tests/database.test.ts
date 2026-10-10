import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { readFileSync, readdirSync } from "node:fs";

const ids = {
  alice: "11111111-1111-4111-8111-111111111111",
  bob: "22222222-2222-4222-8222-222222222222",
  carol: "33333333-3333-4333-8333-333333333333",
  barberAProfile: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  barberBProfile: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  master: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  admin: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  barberA: "44444444-4444-4444-8444-444444444444",
  barberB: "55555555-5555-4555-8555-555555555555",
};
const migrations = readdirSync("supabase/migrations")
  .filter((name) => name.endsWith(".sql"))
  .sort();
let db: PGlite;
let service: string;
let day: string;

async function createDatabase(migrationNames: string[]) {
  const database = new PGlite({ extensions: { btree_gist } });
  await database.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;create publication supabase_realtime;`,
  );
  for (const name of migrationNames)
    await database.exec(readFileSync(`supabase/migrations/${name}`, "utf8"));
  return database;
}

async function asUser(id: string) {
  await db.exec(
    `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`,
  );
}

async function asOwner() {
  await db.exec("reset role;");
}

async function book(
  time: string,
  barberId: string | null = null,
) {
  return db.query<{ id: string }>(
    "select public.create_appointment($1,$2::timestamptz,$3::uuid) as id",
    [service, `${day}T${time}:00-03:00`, barberId],
  );
}

beforeAll(async () => {
  db = await createDatabase(migrations);
  const metadata = JSON.stringify({
    nome: "Cliente Teste",
    telefone: "11999999999",
    data_nascimento: "1990-01-01",
    privacy_accepted: true,
    role: "admin",
  });
  const users = [
    ids.alice,
    ids.bob,
    ids.carol,
    ids.barberAProfile,
    ids.barberBProfile,
    ids.master,
    ids.admin,
  ];
  await db.query(
    "insert into auth.users(id,email,raw_user_meta_data) select id,id::text || '@example.com',$2::jsonb from unnest($1::uuid[]) as id",
    [users, metadata],
  );
  await db.exec(
    `update profiles set role='barber' where id in ('${ids.barberAProfile}','${ids.barberBProfile}');
     update profiles set role='master' where id='${ids.master}';
     update profiles set role='admin' where id='${ids.admin}';
     insert into barbers(id,profile_id,display_name) values
       ('${ids.barberA}','${ids.barberAProfile}','Barbeiro A'),
       ('${ids.barberB}','${ids.barberBProfile}','Barbeiro B');`,
  );
  service = (
    await db.query<{ id: string }>("select id from services limit 1")
  ).rows[0].id;
  day = (
    await db.query<{ day: string }>(
      `select to_char((now() at time zone 'America/Sao_Paulo')::date + ((8-extract(dow from now() at time zone 'America/Sao_Paulo')::int)%7+1),'YYYY-MM-DD') as day`,
    )
  ).rows[0].day;
  await db.exec(
    "update business_hours set closed=false,opens='09:00',closes='19:00';",
  );
});

beforeEach(async () => {
  await asOwner();
  await db.exec(
    `update profiles set role='client' where id in ('${ids.alice}','${ids.bob}','${ids.carol}');
     update profiles set role='barber' where id in ('${ids.barberAProfile}','${ids.barberBProfile}');
     update profiles set role='master' where id='${ids.master}';
     update profiles set role='admin' where id='${ids.admin}';
     delete from barbers where profile_id='${ids.admin}';`,
  );
  await db.exec("delete from appointments;delete from blocked_slots;");
  await db.exec("update barbers set active=true;");
});

afterAll(async () => {
  await db?.close();
});

describe("Regras multi-barbeiro no PostgreSQL e RLS", () => {
  it("a migration do zero exige barber_id e o cadastro ignora role enviada", async () => {
    const nullability = await db.query<{ is_nullable: string }>(
      "select is_nullable from information_schema.columns where table_schema='public' and table_name='appointments' and column_name='barber_id'",
    );
    expect(nullability.rows[0].is_nullable).toBe("NO");
    const snapshotColumn = await db.query<{ is_nullable: string }>(
      "select is_nullable from information_schema.columns where table_schema='public' and table_name='appointments' and column_name='barber_name'",
    );
    expect(snapshotColumn.rows[0].is_nullable).toBe("YES");
    const result = await db.query<{ role: string }>(
      "select role from profiles where id=$1",
      [ids.alice],
    );
    expect(result.rows[0].role).toBe("client");
  });

  it("migration 005 adiciona flag de senha e mantém audit_log exclusivo do servidor", async () => {
    const profile = await db.query<{ must_change_password: boolean }>(
      "select must_change_password from profiles where id=$1",
      [ids.alice],
    );
    expect(profile.rows[0].must_change_password).toBe(false);
    await asUser(ids.alice);
    await expect(
      db.exec(`update profiles set must_change_password=true where id='${ids.alice}'`),
    ).rejects.toThrow(/permission denied/);
    await expect(db.query("select * from audit_log")).rejects.toThrow(
      /permission denied/,
    );
    await db.exec("reset role;set role service_role;");
    await db.query(
      "insert into audit_log(actor_profile_id,action,target_profile_id) values($1,'test_action',$2)",
      [ids.master, ids.alice],
    );
    expect((await db.query("select * from audit_log")).rows).toHaveLength(1);
  });

  it("cliente lê somente o próprio perfil e não altera o próprio papel", async () => {
    await asUser(ids.alice);
    expect((await db.query("select * from profiles")).rows).toHaveLength(1);
    await expect(
      db.exec(`update profiles set role='master' where id='${ids.alice}'`),
    ).rejects.toThrow(/master|permissões/);
  });

  it("não permite vincular como barbeiro um perfil client", async () => {
    await expect(
      db.query(
        "insert into barbers(profile_id,display_name) values($1,'Perfil inválido')",
        [ids.alice],
      ),
    ).rejects.toThrow(/barbeiro, admin ou master/);
  });

  it("admin comum não promove a admin/master, mas master pode", async () => {
    await asUser(ids.admin);
    await expect(
      db.exec(`update profiles set role='admin' where id='${ids.bob}'`),
    ).rejects.toThrow(/Somente master/);
    await expect(
      db.exec(`update profiles set role='master' where id='${ids.bob}'`),
    ).rejects.toThrow(/Somente master/);
    await db.exec(`update profiles set role='barber' where id='${ids.bob}'`);

    await asUser(ids.master);
    await db.exec(`update profiles set role='admin' where id='${ids.bob}'`);
    await db.exec(`update profiles set role='master' where id='${ids.bob}'`);
    const promoted = await db.query<{ role: string }>(
      "select role from profiles where id=$1",
      [ids.bob],
    );
    expect(promoted.rows[0].role).toBe("master");
  });

  it("service_role mantém autorização para alterar papéis", async () => {
    await db.exec("reset role;set role service_role;");
    await db.exec(`update profiles set role='master' where id='${ids.bob}'`);
    const updated = await db.query<{ role: string }>(
      "select role from profiles where id=$1",
      [ids.bob],
    );
    expect(updated.rows[0].role).toBe("master");
  });

  it("aceita admin com registro em barbers e impede rebaixá-lo a client", async () => {
    await asUser(ids.admin);
    const created = await db.query<{ id: string }>(
      "insert into barbers(profile_id,display_name) values($1,'Dono da barbearia') returning id",
      [ids.admin],
    );
    expect(created.rows[0].id).toBeTruthy();
    await expect(
      db.exec(`update profiles set role='client' where id='${ids.admin}'`),
    ).rejects.toThrow(/Somente master/);
    await asUser(ids.master);
    await expect(
      db.exec(`update profiles set role='client' where id='${ids.admin}'`),
    ).rejects.toThrow(/Desative o vínculo/);
  });

  it("dois clientes reservam o mesmo horário com barbeiros diferentes", async () => {
    await asUser(ids.alice);
    const first = await book("09:00", ids.barberA);
    await asUser(ids.bob);
    const second = await book("09:00", ids.barberB);
    expect(first.rows[0].id).toBeTruthy();
    expect(second.rows[0].id).toBeTruthy();
    await asOwner();
    const snapshot = await db.query<{ barber_id: string; barber_name: string }>(
      "select barber_id,barber_name from appointments where id=$1",
      [first.rows[0].id],
    );
    expect(snapshot.rows[0]).toEqual({
      barber_id: ids.barberA,
      barber_name: "Barbeiro A",
    });
    expect(
      (
        await db.query<{ count: number }>(
          "select count(*)::int as count from appointments where start_at=$1::timestamptz",
          [`${day}T09:00:00-03:00`],
        )
      ).rows[0].count,
    ).toBe(2);
  });

  it("o mesmo barbeiro não recebe sobreposição", async () => {
    await asUser(ids.alice);
    await book("09:00", ids.barberA);
    await asUser(ids.bob);
    await expect(book("09:00", ids.barberA)).rejects.toThrow(
      /acabou de ser ocupado/,
    );
  });

  it("sem preferência distribui pelo menor volume diário e falha se todos ocupados", async () => {
    await asUser(ids.alice);
    await book("09:00");
    await asUser(ids.bob);
    await book("10:00");
    await asOwner();
    const assignments = await db.query<{ barber_id: string }>(
      "select barber_id from appointments order by start_at",
    );
    expect(assignments.rows.map((row) => row.barber_id)).toEqual([
      ids.barberA,
      ids.barberB,
    ]);

    await asOwner();
    await db.exec("delete from appointments;");
    await asUser(ids.alice);
    await book("09:00", ids.barberA);
    await asUser(ids.bob);
    await book("09:00", ids.barberB);
    await asUser(ids.carol);
    await expect(book("09:00")).rejects.toThrow(/acabou de ser ocupado/);
  });

  it("mantém um agendamento ativo por cliente por dia em qualquer barbeiro", async () => {
    await asUser(ids.alice);
    await book("09:00", ids.barberA);
    await expect(book("11:00", ids.barberB)).rejects.toThrow(/própria conta/);
  });

  it("barbeiro lê e atualiza somente seus agendamentos", async () => {
    await asUser(ids.alice);
    const own = (await book("09:00", ids.barberA)).rows[0].id;
    await asUser(ids.bob);
    const other = (await book("09:00", ids.barberB)).rows[0].id;
    await asUser(ids.carol);
    expect((await db.query("select * from appointments")).rows).toHaveLength(0);
    await asUser(ids.barberAProfile);
    const visible = await db.query<{ id: string }>("select id from appointments");
    expect(visible.rows).toEqual([{ id: own }]);
    expect((await db.query("select * from barbers")).rows).toHaveLength(0);
    const update = await db.query(
      "update appointments set status='confirmado' where id=$1",
      [own],
    );
    expect(update.rowCount).toBe(1);
    const hiddenUpdate = await db.query(
      "update appointments set status='confirmado' where id=$1",
      [other],
    );
    expect(hiddenUpdate.rowCount).toBe(0);
    const visibleProfiles = await db.query<{ id: string }>(
      "select id from profiles order by id",
    );
    expect(visibleProfiles.rows.map((profile) => profile.id).sort()).toEqual(
      [ids.alice, ids.barberAProfile].sort(),
    );
  });

  it("barbeiro lê profiles de clientes próprios, mas não de outros barbeiros", async () => {
    await asUser(ids.alice);
    await book("09:00", ids.barberA);
    await asUser(ids.bob);
    await book("09:00", ids.barberB);
    await asUser(ids.barberAProfile);
    const visible = await db.query<{ id: string }>(
      "select id from profiles order by id",
    );
    expect(visible.rows.map((profile) => profile.id).sort()).toEqual(
      [ids.alice, ids.barberAProfile].sort(),
    );
  });

  it("barbeiro não escreve serviços, não lê settings nem perfis alheios", async () => {
    await asUser(ids.barberAProfile);
    await expect(
      db.exec("insert into services(name,price,duration_minutes) values('Negado',1,20)"),
    ).rejects.toThrow(/row-level security|permission denied/i);
    expect((await db.query("select * from settings")).rows).toHaveLength(0);
    expect((await db.query("select * from profiles")).rows).toHaveLength(1);
    const before = (
      await db.query<{ opens: string }>("select opens from business_hours where weekday=1")
    ).rows[0].opens;
    await db.exec("update business_hours set opens='08:00' where weekday=1");
    const after = (
      await db.query<{ opens: string }>("select opens from business_hours where weekday=1")
    ).rows[0].opens;
    expect(after).toBe(before);
  });

  it("bloqueios de barbeiro são isolados e bloqueio global cobre todos", async () => {
    await db.query(
      "insert into blocked_slots(barber_id,start_at,end_at) values($1,$2,$3)",
      [ids.barberA, `${day}T09:00:00-03:00`, `${day}T10:00:00-03:00`],
    );
    await asUser(ids.barberBProfile);
    expect((await db.query("select * from blocked_slots")).rows).toHaveLength(0);
    await db.query(
      "insert into blocked_slots(barber_id,start_at,end_at) values($1,$2,$3)",
      [ids.barberB, `${day}T10:00:00-03:00`, `${day}T11:00:00-03:00`],
    );
    await expect(
      db.query(
        "insert into blocked_slots(barber_id,start_at,end_at) values($1,$2,$3)",
        [ids.barberA, `${day}T11:00:00-03:00`, `${day}T12:00:00-03:00`],
      ),
    ).rejects.toThrow(/row-level security/i);
    expect(
      (
        await db.query("select * from get_busy_ranges($1::date,$2::uuid)", [
          day,
          ids.barberA,
        ])
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query("select * from get_busy_ranges($1::date,null)", [day])
      ).rows,
    ).toHaveLength(0);
    await asUser(ids.alice);
    await book("09:00", ids.barberB);
    await asUser(ids.bob);
    await expect(book("09:00", ids.barberA)).rejects.toThrow(/bloqueado|ocupado/);
    await asOwner();
    await db.query(
      "insert into blocked_slots(start_at,end_at) values($1,$2)",
      [`${day}T12:00:00-03:00`, `${day}T13:00:00-03:00`],
    );
    await asUser(ids.carol);
    await expect(book("12:00", ids.barberB)).rejects.toThrow(/bloqueado|ocupado/);
  });

  it("disponibilidade sem barbeiro retorna somente interseções de todos", async () => {
    await asUser(ids.alice);
    await book("09:00", ids.barberA);
    const noIntersection = await db.query(
      "select * from get_busy_ranges($1::date,null)",
      [day],
    );
    expect(noIntersection.rows).toHaveLength(0);
    await asUser(ids.bob);
    await book("09:00", ids.barberB);
    const allBusy = await db.query<{ start_at: string; end_at: string }>(
      "select * from get_busy_ranges($1::date,null)",
      [day],
    );
    expect(allBusy.rows).toHaveLength(1);
    expect(new Date(allBusy.rows[0].start_at).toISOString()).toBe(
      new Date(`${day}T09:00:00-03:00`).toISOString(),
    );
    const oneBarber = await db.query(
      "select * from get_busy_ranges($1::date,$2::uuid)",
      [day, ids.barberA],
    );
    expect(oneBarber.rows).toHaveLength(1);
  });

  it("lista pública expõe somente id e display_name dos barbeiros ativos", async () => {
    await db.exec("reset role;set role anon;");
    const listed = await db.query("select * from list_active_barbers()");
    expect(Object.keys(listed.rows[0] as object).sort()).toEqual([
      "display_name",
      "id",
    ]);
    expect(listed.rows).toHaveLength(2);
    await expect(db.query("select * from barbers")).rejects.toThrow(/permission denied/);
    expect((await db.query("select * from services where active")).rows.length).toBeGreaterThan(0);
    expect((await db.query("select * from settings")).rows).toHaveLength(1);
    expect(
      (
        await db.query<{ tablename: string }>(
          "select tablename from pg_publication_tables where pubname='supabase_realtime' and schemaname='public'",
        )
      ).rows.map((row) => row.tablename),
    ).toContain("appointments");
  });

  it("admin/master gerencia tudo e desativação exige remanejamento ou cancelamento", async () => {
    await asUser(ids.alice);
    await book("09:00", ids.barberA);
    await asUser(ids.master);
    expect((await db.query("select * from appointments")).rows).toHaveLength(1);
    await expect(
      db.query("select deactivate_barber($1,null)", [ids.barberA]),
    ).rejects.toThrow(/Remaneje ou cancele/);
    await db.query("select deactivate_barber($1,$2)", [ids.barberA, ids.barberB]);
    const appointment = await db.query<{ barber_id: string }>(
      "select barber_id from appointments",
    );
    expect(appointment.rows[0].barber_id).toBe(ids.barberB);
    const active = await db.query<{ active: boolean }>(
      "select active from barbers where id=$1",
      [ids.barberA],
    );
    expect(active.rows[0].active).toBe(false);
  });

  it("valida expediente, antecedência, janela, grade e almoço", async () => {
    await asUser(ids.alice);
    await expect(book("10:01", ids.barberA)).rejects.toThrow(/grade/);
    await expect(book("18:40", ids.barberA)).rejects.toThrow(/expediente/);
    await asOwner();
    await db.exec("update business_hours set lunch_start='14:00',lunch_end='15:00'");
    await asUser(ids.alice);
    await expect(book("13:40", ids.barberA)).rejects.toThrow(/almoço/);
  });

  it("cancelamento exige motivo, libera o dia e preserva snapshot do serviço", async () => {
    await asUser(ids.alice);
    await book("09:00", ids.barberA);
    await asOwner();
    await expect(
      db.exec("update appointments set status='cancelado'"),
    ).rejects.toThrow(/motivo do cancelamento/);
    await db.exec(
      "update appointments set status='cancelado',cancel_reason='Solicitação do cliente'",
    );
    await db.exec("update services set price=123,duration_minutes=80 where id='" + service + "'");
    const snapshot = await db.query<{ price: string; duration_minutes: number }>(
      "select price,duration_minutes from appointments",
    );
    expect(Number(snapshot.rows[0].price)).toBe(0);
    expect(snapshot.rows[0].duration_minutes).toBe(40);
    await asUser(ids.alice);
    expect((await book("09:00", ids.barberB)).rows[0].id).toBeTruthy();
  });

  it("permite cancelar agendamento confirmado somente com motivo", async () => {
    await asUser(ids.alice);
    await book("09:00", ids.barberA);
    await asOwner();
    await db.exec("update appointments set status='confirmado'");
    await expect(
      db.exec("update appointments set status='cancelado',cancel_reason=''") ,
    ).rejects.toThrow(/motivo do cancelamento/);
    await db.exec(
      "update appointments set status='cancelado',cancel_reason='Indisponibilidade do barbeiro'",
    );
    const canceled = await db.query<{ status: string; cancel_reason: string }>(
      "select status,cancel_reason from appointments",
    );
    expect(canceled.rows[0]).toEqual({
      status: "cancelado",
      cancel_reason: "Indisponibilidade do barbeiro",
    });
  });

  it("impede transições inválidas de status e preserva exclusão de conta", async () => {
    await asUser(ids.alice);
    await book("09:00", ids.barberA);
    await asOwner();
    await expect(
      db.exec("update appointments set status='concluido' where status='pendente'"),
    ).rejects.toThrow(/status/);
    await db.exec("update appointments set status='confirmado' where status='pendente'");
    await expect(
      db.exec("update appointments set status='concluido' where status='confirmado'"),
    ).rejects.toThrow(/status/);
    await asUser(ids.alice);
    await expect(
      db.query("select erase_account_data($1)", [ids.bob]),
    ).rejects.toThrow(/permission denied/);
    await asOwner();
    await db.query(
      `insert into appointments(client_id,barber_id,service_name,price,duration_minutes,start_at,end_at,booking_date,status)
       values($1,$2,'Histórico',50,40,now()-interval '2 days',now()-interval '2 days'+interval '40 min',(now()-interval '2 days')::date,'concluido')`,
      [ids.alice, ids.barberA],
    );
    await db.query("select erase_account_data($1)", [ids.alice]);
    expect(
      (await db.query("select * from auth.users where id=$1", [ids.alice])).rows,
    ).toHaveLength(0);
    const history = await db.query<{ client_id: string | null; status: string }>(
      "select client_id,status from appointments where status='concluido'",
    );
    expect(history.rows).toEqual([{ client_id: null, status: "concluido" }]);
  });
});

describe("Migração multi-barbeiro sobre banco legado", () => {
  it("promove admin existente a master e não quebra reservas sem barbeiro ativo", async () => {
    const legacyMigrations = migrations.filter(
      (name) => !name.includes("004_") && !name.includes("005_"),
    );
    const legacy = await createDatabase(legacyMigrations);
    try {
      const legacyUser = "66666666-6666-4666-8666-666666666666";
      await legacy.query(
        "insert into auth.users(id,email,raw_user_meta_data) values($1,'owner@example.com',$2::jsonb)",
        [
          legacyUser,
          JSON.stringify({
            nome: "Dono Legado",
            telefone: "11999999999",
            data_nascimento: "1980-01-01",
            privacy_accepted: true,
          }),
        ],
      );
      await legacy.query("update profiles set role='admin' where id=$1", [legacyUser]);
      await legacy.query(
        `insert into appointments(client_id,service_name,price,duration_minutes,start_at,end_at,booking_date)
         values($1,'Legado',30,40,now()+interval '3 days',now()+interval '3 days 40 minutes',(now()+interval '3 days')::date)`,
        [legacyUser],
      );
      const rolesMigration = migrations.find((name) => name.includes("004_"));
      const teamMigration = migrations.find((name) => name.includes("005_"));
      expect(rolesMigration).toBeTruthy();
      expect(teamMigration).toBeTruthy();
      await legacy.exec(readFileSync(`supabase/migrations/${rolesMigration}`, "utf8"));
      await legacy.exec(readFileSync(`supabase/migrations/${teamMigration}`, "utf8"));
      const role = await legacy.query<{ role: string }>(
        "select role from profiles where id=$1",
        [legacyUser],
      );
      expect(role.rows[0].role).toBe("master");
      const barberColumn = await legacy.query<{ is_nullable: string }>(
        "select is_nullable from information_schema.columns where table_schema='public' and table_name='appointments' and column_name='barber_id'",
      );
      expect(barberColumn.rows[0].is_nullable).toBe("YES");
      expect(
        (await legacy.query("select barber_id from appointments")).rows,
      ).toEqual([{ barber_id: null }]);
      const legacyBarber = "77777777-7777-4777-8777-777777777777";
      await legacy.query(
        "insert into auth.users(id,email,raw_user_meta_data) values($1,'barber@example.com','{}'::jsonb)",
        [legacyBarber],
      );
      await legacy.query("update profiles set role='barber' where id=$1", [legacyBarber]);
      await legacy.query(
        "insert into barbers(profile_id,display_name) values($1,'Barbeiro Inicial')",
        [legacyBarber],
      );
      const linked = await legacy.query<{ barber_id: string; barber_name: string }>(
        "select barber_id,barber_name from appointments",
      );
      expect(linked.rows[0].barber_id).toBeTruthy();
      expect(linked.rows[0].barber_name).toBe("Barbeiro Inicial");
    } finally {
      await legacy.close();
    }
  });
});