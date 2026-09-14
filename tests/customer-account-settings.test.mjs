import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";

const customer = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const address = { label: "Casa", address: "Avenida de prueba 123", latitude: -17.39, longitude: -66.15, reference: "Puerta azul" };

test("address edits are atomic, owned by the customer, and preserve one default", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table customer_profiles (id uuid primary key);
      create table customer_addresses (
        id uuid primary key default gen_random_uuid(), customer_id uuid not null references customer_profiles(id),
        label text not null, address text not null, latitude numeric(10,7), longitude numeric(10,7),
        maps_url text, city text, apartment text, building_name text, reference text,
        is_default boolean not null default false, created_at timestamptz default now(), updated_at timestamptz default now()
      );
      create unique index customer_addresses_one_default_idx on customer_addresses(customer_id) where is_default;
      insert into customer_profiles values ('${customer}'), ('${other}');
    `);
    await db.exec(await readFile(new URL("../supabase/migrations/0100_customer_address_management.sql", import.meta.url), "utf8"));
    const mutate = async (who, action, id = null, data = {}) => (await db.query("select * from manage_customer_address($1,$2,$3,$4)", [who, action, id, data])).rows;
    let rows = await mutate(customer, "create", null, address);
    const first = rows[0].id;
    assert.equal(rows[0].is_default, true);
    rows = await mutate(customer, "create", null, { ...address, label: "Trabajo", isDefault: true });
    const second = rows.find((row) => row.label === "Trabajo").id;
    assert.equal(rows.filter((row) => row.is_default).length, 1);
    assert.equal(rows.find((row) => row.is_default).id, second);
    for (const action of ["update", "default", "delete"]) {
      await assert.rejects(mutate(other, action, first, address), /address-not-found/);
    }
    await assert.rejects(mutate(customer, "update", first, { ...address, latitude: "bad", isDefault: true }));
    rows = (await db.query("select * from customer_addresses where customer_id=$1", [customer])).rows;
    assert.equal(rows.find((row) => row.is_default).id, second, "failed edit must not clear default");
    rows = await mutate(customer, "update", first, { ...address, label: "Casa nueva", isDefault: true });
    assert.equal(rows.find((row) => row.is_default).id, first);
    assert.equal(rows.length, 2, "edit must not create a duplicate");
    rows = await mutate(customer, "delete", first);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, second);
    assert.equal(rows[0].is_default, true, "removing the main address selects a replacement");
    await db.exec("set role anon");
    await assert.rejects(mutate(customer, "delete", second), /permission denied/);
    await db.exec("reset role");
  } finally { await db.close(); }
});

const source = await readFile(new URL("../src/lib/services/customer-account.service.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
function serviceWith(options = {}) {
  const deletes = [];
  const mutations = [];
  const tables = {
    customer_profiles: { data: { id: customer }, error: null },
    profiles: { data: null, error: null },
    restaurant_riders: { data: [], error: null },
    orders: { data: [], error: null },
    ...options.tables,
  };
  const admin = {
    auth: {
      getUser: async () => options.unauthorized ? { data: { user: null }, error: {} } : { data: { user: { id: customer } }, error: null },
      admin: { deleteUser: async (id) => { deletes.push(id); return { error: options.deleteError ?? null }; } },
    },
    from(table) {
      const query = { then(resolve) { return Promise.resolve(tables[table]).then(resolve); } };
      for (const method of ["select", "eq", "not", "limit", "maybeSingle"]) query[method] = () => query;
      return query;
    },
    rpc: async (name, args) => { mutations.push({ name, args }); return { data: [], error: null }; },
  };
  const mod = { exports: {} };
  new Function("require", "module", "exports", compiled)(() => ({ createAdminClient: () => admin }), mod, mod.exports);
  return { service: mod.exports, deletes, mutations };
}
const request = () => new Request("http://localhost/api/mobile/customers/profile", { headers: { Authorization: "Bearer test-only" } });

test("deletion requires a valid user and refuses active orders or shared business/rider accounts", async () => {
  for (const options of [
    { unauthorized: true },
    { tables: { orders: { data: [{ id: "active" }], error: null } } },
    { tables: { profiles: { data: { id: customer }, error: null } } },
    { tables: { restaurant_riders: { data: [{ id: "rider" }], error: null } } },
    { tables: { orders: { data: null, error: { message: "offline" } } } },
  ]) {
    const { service, deletes } = serviceWith(options);
    assert.equal((await service.deleteCustomerAccount(request())).ok, false);
    assert.deepEqual(deletes, [], "a failed ownership/state check must never delete Auth");
  }
});

test("successful deletion targets only the authenticated customer, and Auth failures stay failures", async () => {
  const { service, deletes } = serviceWith();
  assert.equal((await service.deleteCustomerAccount(request())).ok, true);
  assert.deepEqual(deletes, [customer]);
  assert.equal((await serviceWith({ deleteError: { message: "failed" } }).service.deleteCustomerAccount(request())).ok, false);
});

test("a customer can delete an incomplete profile without entering more personal data", async () => {
  const { service, deletes } = serviceWith({ tables: { customer_profiles: { data: null, error: null } } });
  assert.equal((await service.deleteCustomerAccount(request())).ok, true);
  assert.deepEqual(deletes, [customer]);
});

test("address service derives ownership from the session, never from caller input", async () => {
  const { service, mutations } = serviceWith();
  await service.mutateCustomerAddress(request(), "update", "address-id", address);
  assert.equal(mutations[0].args.p_customer_id, customer);
  assert.equal(mutations[0].args.p_action, "update");
});
