# Checkpoint 3 — Agent PostgreSQL grounding

## Origem e escopo

Integração seletiva revisada em 2026-09-11, sobre
`db6660e95289238d59ee3aade4f479c2dcc37dad`, na branch `feat/dbstudio-custom`.

- `7249283e451338ac239db7952816d4344d4df642`: agrega colunas PostgreSQL por tabela;
  exige atualizar simultaneamente composer, consumer e fixtures.
- `830d68fcac609035044c374759e7e13d7a970870`: construído sobre o primeiro;
  adiciona exclusões de objetos internos/extensões e fallback de catálogo.

Adaptação manual, sem merge, rebase ou cherry-pick. Nenhuma dependência nova.
Somente três arquivos de produção mudam: `src/lib/agent/composed-sql.ts`,
`src/lib/agent/context-snapshot.ts` e `src/lib/agent/tools.ts`.

## Representação e fluxo

Antes, cada coluna consumia uma linha do resultado interno:

```json
[
  {"table_schema":"public","table_name":"orders","column_name":"id","data_type":"integer","is_nullable":"NO","ordinal_position":1},
  {"table_schema":"public","table_name":"orders","column_name":"total","data_type":"numeric","is_nullable":"YES","ordinal_position":2}
]
```

Agora cada tabela consome uma linha, com colunas ordenadas no JSON:

```json
[
  {"table_schema":"public","table_name":"orders","columns":[
    {"name":"id","type":"integer","nullable":"NO"},
    {"name":"total","type":"numeric","nullable":"YES"}
  ]}
]
```

`composeCatalogRead` gera `json_agg(json_build_object(...))`, ordenando colunas por
`ordinal_position` e linhas por schema/tabela. `readCatalog` executa pela mesma
`executeAgentOperation` e pelo provider original via `queryReadOnly`. O resultado
continua sujeito a guard, policy, profile, budgets, artefatos e auditoria.
`captureContextSnapshot` interpreta `columns` e produz o mesmo contrato de snapshot
que `packContextForTask` já consumia. Relações e índices continuam em projeções
planas, anexados somente às tabelas conhecidas. `inspectSchema` também usa esse
caminho de catálogo. Fixtures de investigação/evals foram migradas juntas.

Não foi necessário mudar tipos públicos: as mudanças upstream em `types.ts` eram
comentários. Não foram usados casts para fingir compatibilidade com linhas antigas.
Identificadores, tipos e conteúdo técnico permanecem dados, não traduções nem SQL
executável. Seletores continuam validados e escapados pelo mecanismo existente.

## Orçamento e determinismo

O teste com duas tabelas de 150 colunas demonstra 300 colunas em **2 linhas**, abaixo
do limite existente de 200 linhas; antes a projeção plana excederia esse limite.
São preservados os nomes, tipos, nulabilidade e ordem das 150 colunas por tabela.
A captura continua cobrando três statements no caminho normal.

Os limites não aumentaram: 200 linhas por resultado, 262144 bytes e pack de contexto
de até 6000 caracteres, com até 12 colunas por tabela no pack. A redução comprovada
é de linhas de catálogo; não é uma promessa de redução proporcional de tokens.
O JSON agregado ainda pode ultrapassar o limite de bytes. Muitas tabelas ainda
podem ultrapassar o limite de linhas. Refusal/truncamento e o packing mantêm suas
regras anteriores. Ordenação e fingerprint do snapshot não foram alterados.

## Filtros e fallback

A lista fixa é exatamente a do upstream `830d68fc`, não uma nova seleção do fork:

```text
pg_catalog, information_schema, pg_toast,
mz_catalog, mz_internal, mz_introspection, crdb_internal, pg_extension,
_timescaledb_catalog, _timescaledb_config, _timescaledb_functions,
_timescaledb_internal, _timescaledb_cache, timescaledb_experimental,
timescaledb_information, gp_toolkit, pg_aoseg, pg_bitmapindex, pg_ext_aux
```

As quatro leituras (columns, relations, indexes, statistics) também consultam
`pg_namespace`/`pg_class`, `pg_depend` e `pg_extension`, com `deptype = 'e'` e
`classid` correspondente. Isso exclui schemas pertencentes a extensões e relações
de extensão em schemas compartilhados, inclusive `public`. Não se excluem nomes
como `ai` ou `google_ml` indiscriminadamente. `public.customers` e `public.orders`
permanecem; views do usuário não são descartadas por um novo filtro de tipo.

O fallback reproduz o upstream: somente para PostgreSQL, refusal `database-error`
cuja mensagem mencione `pg_depend` ou `pg_extension`, remove apenas os dois testes
de ownership compostos pela aplicação e tenta uma vez. Não é um detector por
SQLSTATE. Mantém a lista fixa, seletores e todos os controles de execução. Erros
não relacionados, recusas de segurança e outros providers não ganham esse retry.

Limitação deliberada: sem esses catálogos, o fallback não consegue distinguir
objetos de extensão em schemas não incluídos na lista fixa. Não oferece a mesma
filtragem por ownership do caminho completo, nem ignora os limites de segurança.
Se as três leituras de captura falharem por ausência de ownership, o orçamento de
reparos existente se esgota: o teste registra cinco statements e snapshot
`unavailable`/`CATALOG_READ_REFUSED`. Não aumentamos budgets para forçar sucesso.

O consumer aceita arrays JSON ou JSON em texto. Metadata ausente/malformada produz
colunas vazias; entradas nulas/escalares são descartadas. Relações/índices órfãos
não recriam uma tabela ausente da leitura de colunas. A captura não ganhou uma
transação de snapshot consistente: o teste de metadata obsoleta não promete
resolver todas as corridas de DDL concorrente.

## Preservações e omissões deliberadas

- SQL novo exclusivamente de leitura. Sem mudanças em operation policy,
  statement guard, permissions/roles, budgets, read-only profile/cleanup,
  autorização, consentimento ou critérios de execução automática.
- Prompts, descrições de tools, IDs/configuração de modelo, invocação LLM e
  tratamento de conteúdo do modelo intactos; só o grounding de entrada melhora.
- UI e catálogos i18n (`en`, `pt-BR`, fallback/deep merge) intactos.
- Providers/factory/contratos/visibility, auth, APIs públicas, storage, Query
  Safety, deploy, Schema Diff e Create Table intactos. Sem Safe Mode ou EXPLAIN.
- `package.json` e `bun.lock` intactos.
- Não copiamos comentários de compatibilidade que afirmam resultados de imagens
  reais testadas pelo upstream: não foram medições feitas neste checkpoint.
- Não importamos a constante de schemas de um provider upstream mais recente:
  ela depende de mudanças separadas ausentes no fork. Os testes fixam a lista
  exata no Agent, sem alterar providers ou adicionar esse acoplamento.
- Não copiamos grandes atualizações históricas de docs, comentários de tipos ou
  mudanças de retry/tuning de outros bundles. Este documento registra a adaptação.

## Validação

Execuções em processos separados para evitar interferência entre mocks globais.
Contagem abaixo refere-se à árvore modificada, sem somar reexecuções/baseline.

| Grupo | Aprovados | Falhas |
| --- | ---: | ---: |
| Composer, context snapshot, tools (3 arquivos) | 477 | 0 |
| Policy, guard, execution e policy gates (5 arquivos) | 204 | 0 |
| Investigação isolada | 162 | 0 |
| Investigação E2E | 2 | 2 |
| Package/dependency boundary | 24 | 7 |
| Statement boundary e execution audit | 56 | 1 |
| Evals: injection, legacy surface, plan grounding | 44 | 0 |
| ConsentCard | 18 | 0 |
| PostgreSQL provider: filtro `queryReadOnly` | 28 | 0 |
| **Total: 19 arquivos** | **1015** | **10** |

Foram adicionados 25 casos: 10 composer, 9 snapshot e 6 tools. Outros testes e
fixtures foram adaptados ao novo formato. Os 112 testes fora do filtro do provider
não entram no total. A suíte completa agregada não foi executada.

As dez falhas foram reproduzidas numa cópia temporária exata de HEAD anterior:
sete pressupõem `/` em caminhos Windows; duas ocorrem no `afterEach` de E2E
SQLite (`EBUSY`); uma no `afterAll` de statement boundary SQLite (`EBUSY`).
Na base, os grupos correspondentes resultaram em 24/7, 0/2 (só SQLite) e 56/1.
Não houve correção dessas suítes. Os casos PostgreSQL E2E modificados passaram.

- `bun run typecheck`: sucesso, zero erros.
- `bun run lint`: sucesso, zero erros, 131 avisos; sem correções globais.
- `bun run build`: sucesso.
- `git diff --check`: sucesso; repetido sobre o conteúdo staged antes do commit.
- Git avisa sobre conversão futura LF/CRLF; sem normalização ampla.

PostgreSQL e engines compatíveis foram validados com mocks/fixtures de formato
SQL, não com servidores reais. Testes existentes de segurança/E2E usam SQLite
descartável. Nenhum banco, credencial ou dado do usuário foi utilizado; nenhum
LLM real ou container foi necessário. Os filtros por engine têm cobertura de
SQL/consumer, não uma certificação de compatibilidade com servidores dessas engines.

## Checkpoint

Commit local previsto: `fix: improve agent grounding capture`.
Somente os três arquivos de produção, oito arquivos de testes/fixtures e este
documento pertencem ao checkpoint. `docs/FORK_BASELINE.md` e
`docs/INTERNAL_ARCHITECTURE_MAP.md` permanecem intocados e fora do commit.
Não publicar nem iniciar outro bundle como parte desta tarefa.
