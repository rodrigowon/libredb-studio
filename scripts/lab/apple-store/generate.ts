import { createHash } from "node:crypto";

export const FIXTURE_ID = "libredb-apple-store-lab";
export const VERSION = "1.0.0";
export const SEED = 20260925;
export const SCHEMA = "apple_store_lab";
export const TABLES = [
  "categorias",
  "produtos",
  "fornecedores",
  "clientes",
  "funcionarios",
  "vendas",
  "itens_venda",
  "entradas_estoque",
  "movimentacoes_estoque",
  "estoque",
  "metadata_teste",
] as const;
export type Table = (typeof TABLES)[number];
export type Row = Record<string, string | number | boolean | null>;
export type Dataset = Record<Table, Row[]>;

// Mulberry32: unsigned, fixed-width arithmetic; no clock, locale or external input.
function random(seed: number) {
  let state = seed >>> 0;
  return (limit: number) => {
    state = (state + 0x6d2b79f5) >>> 0;
    let x = Math.imul(state ^ (state >>> 15), state | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return Math.floor((((x ^ (x >>> 14)) >>> 0) / 4294967296) * limit);
  };
}

export function isValidCpf(value: string): boolean {
  const digits = value.replace(/[.-]/g, "");
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  const check = (count: number) => {
    let sum = 0;
    for (let i = 0; i < count; i++) sum += Number(digits[i]) * (count + 1 - i);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return check(9) === Number(digits[9]) && check(10) === Number(digits[10]);
}

function fakeCpf(id: number): string {
  const base = String(id).padStart(9, "0");
  // At most one of these candidates could be valid. Check rather than assume.
  const digits = isValidCpf(`${base}00`) ? `${base}01` : `${base}00`;
  if (isValidCpf(digits)) throw new Error("Synthetic CPF unexpectedly passed validation");
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export function money(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error("Invalid integer cents");
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

export function cents(value: Row[string]): number {
  const match = /^(\d+)\.(\d{2})$/.exec(String(value));
  if (!match) throw new Error("Expected fixed two-decimal money");
  return Number(match[1]) * 100 + Number(match[2]);
}

const cities = [
  ["São Paulo", "SP"],
  ["Campinas", "SP"],
  ["Rio de Janeiro", "RJ"],
  ["Belo Horizonte", "MG"],
  ["Curitiba", "PR"],
  ["Florianópolis", "SC"],
  ["Porto Alegre", "RS"],
  ["Brasília", "DF"],
  ["Goiânia", "GO"],
  ["Salvador", "BA"],
  ["Recife", "PE"],
  ["Fortaleza", "CE"],
  ["Manaus", "AM"],
  ["Belém", "PA"],
  ["Vitória", "ES"],
  ["Natal", "RN"],
] as const;
const firstNames = ["Ana", "João", "Luísa", "André", "Márcia", "José", "Cecília", "Caio", "Íris", "Rafael"];
const surnames = ["Silva", "Oliveira", "Lima", "Souza", "Almeida", "Pereira", "Costa", "Rocha"];
const categories = ["iPhone", "Mac", "iPad", "Apple Watch", "AirPods", "Displays", "Acessórios"];
const families = [
  ["iPhone Lab", "iPhone Plus Lab", "iPhone Pro Lab", "iPhone Mini Lab", "iPhone SE Lab", "iPhone Max Lab"],
  ["MacBook Air Lab", "MacBook Pro Lab", "Mac mini Lab", "iMac Lab", "Mac Studio Lab", "Mac Pro Lab"],
  ["iPad Lab", "iPad Air Lab", "iPad Pro Lab", "iPad mini Lab", "iPad Wi-Fi Lab"],
  ["Apple Watch Lab", "Apple Watch SE Lab", "Apple Watch Ultra Lab", "Pulseira Watch Lab", "Carregador Watch Lab"],
  ["AirPods Lab", "AirPods Pro Lab", "AirPods Max Lab", "Estojo AirPods Lab"],
  ["Studio Display Lab", "Pro Display Lab", "Suporte Display Lab", "Adaptador Display Lab"],
  ["Magic Mouse Lab", "Magic Keyboard Lab", "Cabo USB-C Lab", "Carregador USB-C Lab", "Capa Lab", "Apple Pencil Lab"],
];
const start = Date.UTC(2024, 0, 1);
const timestamp = (day: number, minute = 0) => new Date(start + day * 86400000 + minute * 60000).toISOString();

export function generate(seed = SEED): Dataset {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error("Seed must be uint32");
  const next = random(seed);
  const data: Dataset = {
    categorias: [],
    produtos: [],
    fornecedores: [],
    clientes: [],
    funcionarios: [],
    vendas: [],
    itens_venda: [],
    entradas_estoque: [],
    movimentacoes_estoque: [],
    estoque: [],
    metadata_teste: [],
  };
  data.categorias = categories.map((nome, i) => ({ id: i + 1, nome }));
  families.forEach((names, category) =>
    names.forEach((nome) => {
      const id = data.produtos.length + 1;
      const price = 14900 + next(18000) * 100;
      data.produtos.push({
        id,
        categoria_id: category + 1,
        sku: `LAB-APPLE-${String(id).padStart(3, "0")}`,
        nome,
        preco: money(price),
        custo: money(Math.floor((price * 65) / 100)),
        ativo: id % 11 !== 0,
      });
    }),
  );
  for (let id = 1; id <= 6; id++)
    data.fornecedores.push({
      id,
      nome: `Fornecedor Fictício ${id}`,
      identificador_ficticio: `FORNECEDOR-LAB-${id}`,
      email: `fornecedor${id}@example.test`,
    });
  for (let id = 1; id <= 2000; id++) {
    const [cidade, estado] = cities[(id - 1) % cities.length];
    data.clientes.push({
      id,
      nome: `${firstNames[next(firstNames.length)]} ${surnames[next(surnames.length)]} Teste ${id}`,
      cpf_ficticio: fakeCpf(id),
      data_nascimento: `${1950 + next(51)}-${String(1 + next(12)).padStart(2, "0")}-${String(1 + next(28)).padStart(2, "0")}`,
      email: `cliente${String(id).padStart(4, "0")}@example.test`,
      telefone: `TEL-LAB-${id}`,
      endereco: `Rua Fictícia ${1 + next(50)}`,
      numero: String(1 + next(300)),
      complemento: id % 3 === 0 ? `Unidade Teste ${id}` : null,
      bairro: `Bairro Simulado ${1 + next(8)}`,
      cidade,
      estado,
      cep_ficticio: `CEP-LAB-${String(id).padStart(5, "0")}`,
      data_cadastro: timestamp(-365 + next(365), next(1440)),
      ativo: id % 13 !== 0,
    });
  }
  const jobs = ["vendedor", "supervisor", "caixa", "gerente", "estoque"];
  for (let id = 1; id <= 12; id++)
    data.funcionarios.push({
      id,
      nome: `Funcionário Fictício ${id}`,
      cargo: jobs[(id - 1) % jobs.length],
      email: `funcionario${id}@example.test`,
      ativo: true,
    });
  for (let id = 1; id <= 3500; id++) {
    const slot = (id - 1) % 20;
    const count = slot < 12 ? 1 : slot < 17 ? 2 : slot < 19 ? 3 : 4;
    const status = slot === 0 ? "CANCELADA" : slot === 1 ? "PENDENTE" : "CONCLUIDA";
    const date = timestamp(1 + Math.floor(((id - 1) * 728) / 3500), next(1440));
    const selected = new Set<number>();
    let total = 0;
    for (let j = 0; j < count; j++) {
      let product = next(data.produtos.length);
      while (selected.has(product)) product = (product + 1) % data.produtos.length;
      selected.add(product);
      const itemId = data.itens_venda.length + 1;
      const quantity = 1 + next(3);
      const price = cents(data.produtos[product].preco);
      const discount = Math.floor((price * quantity * next(6)) / 100);
      const subtotal = price * quantity - discount;
      total += subtotal;
      data.itens_venda.push({
        id: itemId,
        venda_id: id,
        produto_id: product + 1,
        quantidade: quantity,
        preco_unitario: money(price),
        desconto_item: money(discount),
        subtotal: money(subtotal),
      });
      if (status === "CONCLUIDA")
        data.movimentacoes_estoque.push({
          id: 0,
          produto_id: product + 1,
          tipo: "SAIDA",
          quantidade: -quantity,
          data_movimentacao: date,
          entrada_id: null,
          item_venda_id: itemId,
          motivo: "Venda fictícia concluída",
        });
    }
    const discount = Math.floor((total * next(4)) / 100);
    data.vendas.push({
      id,
      cliente_id: 1 + next(1800),
      funcionario_id: 1 + next(12),
      data_venda: date,
      status,
      forma_pagamento: ["PIX", "CREDITO", "DEBITO", "DINHEIRO", "BOLETO"][next(5)],
      canal: ["LOJA", "ONLINE", "RETIRADA"][next(3)],
      desconto: money(discount),
      valor_total: money(total - discount),
    });
  }
  for (let id = 1; id <= 250; id++) {
    const product = (id - 1) % data.produtos.length;
    const quantity = 10 + next(26);
    const date = timestamp(Math.floor(((id - 1) * 700) / 250), 600);
    data.entradas_estoque.push({
      id,
      fornecedor_id: 1 + next(6),
      produto_id: product + 1,
      quantidade: quantity,
      custo_unitario: data.produtos[product].custo,
      data_entrada: date,
      nota_fiscal_ficticia: `NF-FICTICIA-LAB-${id}`,
    });
    data.movimentacoes_estoque.push({
      id: 0,
      produto_id: product + 1,
      tipo: "ENTRADA",
      quantidade: quantity,
      data_movimentacao: date,
      entrada_id: id,
      item_venda_id: null,
      motivo: "Compra fictícia de fornecedor",
    });
  }
  // Reconcile the entire timeline, not just the final snapshot. Opening stock is a
  // documented signed adjustment; the final stocktake produces deliberate stock states.
  for (const product of data.produtos) {
    const events = data.movimentacoes_estoque
      .filter((m) => m.produto_id === product.id)
      .sort((a, b) =>
        String(a.data_movimentacao) < String(b.data_movimentacao)
          ? -1
          : String(a.data_movimentacao) > String(b.data_movimentacao)
            ? 1
            : 0,
      );
    let balance = 0;
    let minimum = 0;
    for (const event of events) {
      balance += Number(event.quantidade);
      minimum = Math.min(minimum, balance);
    }
    const opening = -minimum + 10;
    const target = [0, 2, 30, 150][(Number(product.id) - 1) % 4];
    const adjustment = target - (opening + balance);
    data.movimentacoes_estoque.push({
      id: 0,
      produto_id: product.id,
      tipo: "AJUSTE",
      quantidade: opening,
      data_movimentacao: timestamp(0),
      entrada_id: null,
      item_venda_id: null,
      motivo: "Saldo inicial fictício",
    });
    if (adjustment !== 0)
      data.movimentacoes_estoque.push({
        id: 0,
        produto_id: product.id,
        tipo: "AJUSTE",
        quantidade: adjustment,
        data_movimentacao: timestamp(730),
        entrada_id: null,
        item_venda_id: null,
        motivo: "Inventário final fictício",
      });
    data.estoque.push({
      id: product.id,
      produto_id: product.id,
      quantidade: target,
      estoque_minimo: 5,
      localizacao: `LAB-PRATELEIRA-${product.id}`,
      ultima_atualizacao: timestamp(730),
    });
  }
  data.movimentacoes_estoque
    .sort((a, b) => {
      const left = String(a.data_movimentacao),
        right = String(b.data_movimentacao);
      return left < right ? -1 : left > right ? 1 : 0;
    })
    .forEach((m, i) => {
      m.id = i + 1;
    });
  data.metadata_teste.push({
    id: 1,
    fixture_id: FIXTURE_ID,
    versao: VERSION,
    seed,
    clientes_previstos: 2000,
    data_logica: "2026-09-25",
    descricao: "Loja Apple fictícia para laboratório PostgreSQL",
    aviso_cpf: "CPFs sintéticos e matematicamente inválidos",
    aviso_comercial: "Não oficial; preços, pessoas e operações fictícios",
  });
  return data;
}

export function logicalHash(data: Dataset): string {
  return createHash("sha256")
    .update(JSON.stringify(TABLES.map((table) => [table, data[table]])))
    .digest("hex");
}
