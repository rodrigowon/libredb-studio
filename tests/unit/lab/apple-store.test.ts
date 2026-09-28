import { describe, expect, test } from "bun:test";
import type { Client } from "pg";
import {
  cents,
  FIXTURE_ID,
  generate,
  isValidCpf,
  logicalHash,
  money,
  SEED,
  TABLES,
  VERSION,
  type Table,
} from "../../../scripts/lab/apple-store/generate";
import { configuration, insertBatch, runFixture } from "../../../scripts/lab/apple-store/seed";

const data = generate();
const env = {
  APPLE_STORE_LAB_DATABASE_URL: "postgresql://lab:fixture-only@127.0.0.1:55432/lab_test",
  APPLE_STORE_LAB_CONFIRM_DATABASE: "lab_test",
};

// Independent modulus implementation; do not use the generator's CPF validator as the oracle.
function validCpf(cpf: string) {
  const digits = cpf.replace(/\D/g, "").split("").map(Number);
  if (digits.length !== 11 || new Set(digits).size === 1) return false;
  return [9, 10].every((length) => {
    const remainder = digits.slice(0, length).reduce((sum, digit, i) => sum + digit * (length + 1 - i), 0) % 11;
    return digits[length] === (remainder < 2 ? 0 : 11 - remainder);
  });
}

describe("Apple Store deterministic lab data", () => {
  test("exact counts, sequential unique identities and fixed metadata", () => {
    expect(Object.fromEntries(TABLES.map((t) => [t, data[t].length]))).toEqual({
      categorias: 7,
      produtos: 36,
      fornecedores: 6,
      clientes: 2000,
      funcionarios: 12,
      vendas: 3500,
      itens_venda: 5600,
      entradas_estoque: 250,
      movimentacoes_estoque: 5572,
      estoque: 36,
      metadata_teste: 1,
    });
    for (const table of TABLES) expect(data[table].map((row) => row.id)).toEqual(data[table].map((_, i) => i + 1));
    expect(data.metadata_teste[0]).toMatchObject({
      fixture_id: FIXTURE_ID,
      versao: VERSION,
      seed: SEED,
      data_logica: "2026-09-25",
      clientes_previstos: 2000,
    });
  });

  test("all CPF-shaped identifiers are unique and mathematically invalid", () => {
    // Arithmetic-only control strings, not assigned to any fixture person.
    for (const validator of [validCpf, isValidCpf]) {
      expect(validator("123.456.789-09")).toBe(true);
      expect(validator("111.111.111-11")).toBe(false);
      expect(validator("123")).toBe(false);
    }
    expect(new Set(data.clientes.map((c) => c.cpf_ficticio)).size).toBe(2000);
    for (const customer of data.clientes) {
      expect(customer.cpf_ficticio).toMatch(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/);
      expect(validCpf(String(customer.cpf_ficticio))).toBe(false);
    }
  });

  test("reserved contacts, synthetic addresses, plausible birthdays and regional diversity", () => {
    for (const table of ["clientes", "funcionarios", "fornecedores"] as const) {
      expect(new Set(data[table].map((r) => r.email)).size).toBe(data[table].length);
      expect(data[table].every((r) => String(r.email).endsWith("@example.test"))).toBe(true);
    }
    for (const c of data.clientes) {
      expect(c.telefone).toMatch(/^TEL-LAB-/);
      expect(c.cep_ficticio).toMatch(/^CEP-LAB-/);
      expect(c.endereco).toMatch(/^Rua Fictícia /);
      const birthday = String(c.data_nascimento);
      expect(new Date(birthday).toISOString().slice(0, 10)).toBe(birthday);
      expect(birthday >= "1950-01-01" && birthday <= "2000-12-31").toBe(true);
      expect(String(c.data_cadastro) < "2024-01-01").toBe(true);
    }
    expect(new Set(data.clientes.map((c) => c.cidade)).size).toBe(16);
    expect(new Set(data.clientes.map((c) => c.estado)).size).toBe(15);
  });

  test("every foreign key resolves", () => {
    const references: [Table, string, Table][] = [
      ["produtos", "categoria_id", "categorias"],
      ["estoque", "produto_id", "produtos"],
      ["vendas", "cliente_id", "clientes"],
      ["vendas", "funcionario_id", "funcionarios"],
      ["itens_venda", "venda_id", "vendas"],
      ["itens_venda", "produto_id", "produtos"],
      ["entradas_estoque", "produto_id", "produtos"],
      ["entradas_estoque", "fornecedor_id", "fornecedores"],
      ["movimentacoes_estoque", "produto_id", "produtos"],
      ["movimentacoes_estoque", "entrada_id", "entradas_estoque"],
      ["movimentacoes_estoque", "item_venda_id", "itens_venda"],
    ];
    for (const [table, field, target] of references) {
      const ids = new Set(data[target].map((r) => r.id));
      expect(data[table].every((r) => r[field] === null || ids.has(r[field]))).toBe(true);
    }
  });

  test("item and sale arithmetic uses exact integer cents, 1–4 distinct products", () => {
    for (const item of data.itens_venda)
      expect(cents(item.subtotal)).toBe(
        cents(item.preco_unitario) * Number(item.quantidade) - cents(item.desconto_item),
      );
    for (const sale of data.vendas) {
      const items = data.itens_venda.filter((i) => i.venda_id === sale.id);
      expect(items.length >= 1 && items.length <= 4).toBe(true);
      expect(new Set(items.map((i) => i.produto_id)).size).toBe(items.length);
      expect(cents(sale.valor_total)).toBe(
        items.reduce((sum, item) => sum + cents(item.subtotal), 0) - cents(sale.desconto),
      );
      expect(cents(sale.valor_total)).toBeGreaterThanOrEqual(0);
    }
    expect(money(101)).toBe("1.01");
    expect(() => money(1.1)).toThrow();
    expect(() => money(-1)).toThrow();
    expect(() => cents("1.123")).toThrow();
  });

  test("completed sales alone generate one matching stock exit per item", () => {
    const exits = new Map(
      data.movimentacoes_estoque.filter((m) => m.tipo === "SAIDA").map((m) => [m.item_venda_id, m]),
    );
    expect(exits.size).toBe(5250);
    for (const item of data.itens_venda) {
      const sale = data.vendas[Number(item.venda_id) - 1];
      if (sale.status === "CONCLUIDA")
        expect(exits.get(item.id)).toMatchObject({
          produto_id: item.produto_id,
          quantidade: -Number(item.quantidade),
          data_movimentacao: sale.data_venda,
        });
      else expect(exits.has(item.id)).toBe(false);
    }
    expect(data.vendas.filter((v) => v.status === "CONCLUIDA").length).toBe(3150);
    expect(data.vendas.filter((v) => v.status === "PENDENTE").length).toBe(175);
    expect(data.vendas.filter((v) => v.status === "CANCELADA").length).toBe(175);
    expect(new Set(data.vendas.map((v) => String(v.data_venda).slice(0, 7))).size).toBe(24);
  });

  test("supplier entries match movements; complete timeline never becomes negative", () => {
    const entries = new Map(
      data.movimentacoes_estoque.filter((m) => m.tipo === "ENTRADA").map((m) => [m.entrada_id, m]),
    );
    expect(entries.size).toBe(250);
    for (const entry of data.entradas_estoque)
      expect(entries.get(entry.id)).toMatchObject({
        produto_id: entry.produto_id,
        quantidade: entry.quantidade,
        data_movimentacao: entry.data_entrada,
      });
    for (const stock of data.estoque) {
      let balance = 0;
      for (const movement of data.movimentacoes_estoque.filter((m) => m.produto_id === stock.produto_id)) {
        balance += Number(movement.quantidade);
        expect(balance).toBeGreaterThanOrEqual(0);
      }
      expect(balance).toBe(Number(stock.quantidade));
    }
    expect(data.estoque.filter((s) => s.quantidade === 0).length).toBe(9);
    expect(data.estoque.filter((s) => s.quantidade === 2).length).toBe(9);
  });

  test("stable logical digest, explicit seed, no enormous snapshot", () => {
    expect(logicalHash(data)).toBe("8b4160886b6ea0929bc4f867cf2e8ee36d8ef96435eb4813e8461260e399c6a5");
    expect(logicalHash(generate(SEED))).toBe(logicalHash(data));
    expect(logicalHash(generate(SEED + 1))).not.toBe(logicalHash(data));
    expect(() => generate(-1)).toThrow();
    expect(() => generate(1.2)).toThrow();
  });
});

describe("lab destination and write guards", () => {
  test("requires dedicated URL and exact independent database confirmation", () => {
    expect(configuration(env, []).database).toBe("lab_test");
    expect(configuration(env, ["--validate"]).validateOnly).toBe(true);
    expect(() => configuration({ DATABASE_URL: env.APPLE_STORE_LAB_DATABASE_URL }, [])).toThrow(
      "APPLE_STORE_LAB_DATABASE_URL",
    );
    expect(() => configuration({ ...env, APPLE_STORE_LAB_CONFIRM_DATABASE: "different" }, [])).toThrow("exactly match");
    for (const url of [
      "bad",
      "https://localhost/lab_test",
      "postgresql://localhost/",
      "postgresql://localhost/%XX",
      `${env.APPLE_STORE_LAB_DATABASE_URL}?host=other`,
      `${env.APPLE_STORE_LAB_DATABASE_URL}?database=other`,
    ]) {
      expect(() => configuration({ ...env, APPLE_STORE_LAB_DATABASE_URL: url }, [])).toThrow();
    }
    expect(
      configuration({ ...env, APPLE_STORE_LAB_DATABASE_URL: `${env.APPLE_STORE_LAB_DATABASE_URL}?sslmode=require` }, [])
        .database,
    ).toBe("lab_test");
    expect(() => configuration(env, ["--reset"])).toThrow("No reset");
    expect(() => configuration(env, ["--validate", "extra"])).toThrow();
  });

  test("bounded inserts parameterize every value, reject unsafe identifiers", () => {
    const name = "'); DROP SCHEMA public CASCADE; --";
    const batch = insertBatch("categorias", [
      { id: 1, nome: name },
      { id: 2, nome: "second" },
    ]);
    expect(batch.text).toEndWith("VALUES ($1,$2),($3,$4)");
    expect(batch.text).not.toContain(name);
    expect(batch.values).toEqual([1, name, 2, "second"]);
    expect(() => insertBatch("categorias", [])).toThrow();
    expect(() => insertBatch("categorias", Array(251).fill({ id: 1 }))).toThrow();
    expect(() => insertBatch("categorias", [{ 'bad"column': 1 }])).toThrow();
    expect(() => insertBatch("categorias", [{ id: 1 }, { nome: "missing" }])).toThrow();
  });
});

// Local query double tests control flow only. It is NOT PostgreSQL compatibility validation.
function fakeClient(
  options: {
    wrongDatabase?: boolean;
    existing?: boolean;
    marker?: boolean;
    locked?: boolean;
    failInsert?: boolean;
    failedValidation?: boolean;
  } = {},
) {
  const calls: string[] = [];
  return {
    calls,
    client: {
      async query(input: string | { text: string }) {
        const sql = typeof input === "string" ? input : input.text;
        calls.push(sql);
        let rows: Record<string, unknown>[] = [];
        if (sql.includes("current_database()")) rows = [{ database: options.wrongDatabase ? "other" : "lab_test" }];
        else if (sql.includes("pg_try_advisory")) rows = [{ locked: options.locked !== false }];
        else if (sql.includes("FROM pg_namespace")) rows = options.existing ? [{}] : [];
        else if (sql.includes("FROM pg_class")) rows = options.marker ? [{}] : [];
        else if (sql.startsWith("SELECT fixture_id")) rows = [{ fixture_id: FIXTURE_ID, versao: VERSION, seed: SEED }];
        else if (sql.includes("WITH counts AS"))
          rows = [{ check_name: "counts", violations: options.failedValidation ? "1" : "0" }];
        else if (sql.startsWith("INSERT") && options.failInsert) throw new Error("simulated insert failure");
        return { rows, rowCount: rows.length };
      },
    } as unknown as Client,
  };
}

describe("transaction and repeat-run protection", () => {
  test("actual database mismatch stops before transaction or writes", async () => {
    const f = fakeClient({ wrongDatabase: true });
    await expect(runFixture(f.client, "lab_test", false, data)).rejects.toThrow("differs");
    expect(f.calls.length).toBe(1);
  });
  test("existing unknown or recognized schemas are never changed", async () => {
    for (const marker of [false, true]) {
      const f = fakeClient({ existing: true, marker });
      // oxlint-disable-next-line no-await-in-loop -- Verify each isolated refusal and its transaction trace in order.
      await expect(runFixture(f.client, "lab_test", false, data)).rejects.toThrow(
        marker ? "Fixture already exists" : "not a recognized fixture",
      );
      expect(f.calls.at(-1)).toBe("ROLLBACK");
      expect(
        f.calls.some((sql) => sql.includes("CREATE SCHEMA") || sql.startsWith("INSERT") || sql.includes("DROP")),
      ).toBe(false);
    }
  });
  test("concurrent seed lock refusal is non-destructive", async () => {
    const f = fakeClient({ locked: false });
    await expect(runFixture(f.client, "lab_test", false, data)).rejects.toThrow("Another lab seed");
    expect(f.calls.at(-1)).toBe("ROLLBACK");
    expect(f.calls.some((sql) => sql.includes("CREATE SCHEMA"))).toBe(false);
  });
  test("insert or validation failures roll back the new schema and data", async () => {
    for (const options of [{ failInsert: true }, { failedValidation: true }]) {
      const f = fakeClient(options);
      // oxlint-disable-next-line no-await-in-loop -- Inspect each isolated rollback before the next failure scenario.
      await expect(runFixture(f.client, "lab_test", false, data)).rejects.toThrow();
      expect(f.calls.at(-1)).toBe("ROLLBACK");
      expect(f.calls).not.toContain("COMMIT");
    }
  });
  test("successful seed commits after checks; adjusts all new identities", async () => {
    const f = fakeClient();
    await runFixture(f.client, "lab_test", false, data);
    expect(f.calls.at(-1)).toBe("COMMIT");
    expect(f.calls.filter((sql) => sql.startsWith("SELECT setval")).length).toBe(11);
    expect(f.calls.filter((sql) => sql.startsWith("INSERT")).length).toBe(75);
  });
  test("validate mode is read-only and never seeds", async () => {
    const f = fakeClient();
    await runFixture(f.client, "lab_test", true, data);
    expect(f.calls).toContain("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(f.calls.some((sql) => /CREATE SCHEMA|INSERT|setval|pg_try_advisory/.test(sql))).toBe(false);
    expect(f.calls.at(-1)).toBe("COMMIT");
  });
});
