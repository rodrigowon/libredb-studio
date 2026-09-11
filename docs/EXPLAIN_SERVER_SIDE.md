# Checkpoint 4 — EXPLAIN server-side

## Origem e decisão do fork

Adaptação seletiva sobre `2a3242732eac3251ff52e9517e762d13d1afd2df`, na branch
`feat/dbstudio-custom`. Sem merge, rebase ou cherry-pick automático.

- `e11015ab87050d9d1fc09fcc59366dcbf2ab03b1`: move a escolha de estratégia para a
  query API, negocia gramática MySQL ao conectar, introduz `mysql-text` e adapta
  hook/renderer. O fork tinha montagem client-side e formato estático.
- `745d0757`: depende dessa API/registry; acrescenta probes PostgreSQL,
  `postgres-text`, `postgres-text-analyze` e o helper compartilhado de árvores
  textuais. O fork tinha somente `postgres-json` para esse provider.
- Divergência intencional: upstream ainda gerava
  `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` em modo `estimate`. Aqui estimate gera
  `EXPLAIN (FORMAT JSON)`; analyze continua explícito e condicionado ao suporte.

Não houve dependência nova. Parsers adicionados interpretam **saída de EXPLAIN**,
não SQL; não substituem o futuro classificador do Production Safe Mode.

## Contrato e fluxo

```text
Editor / use-query-execution
  → SQL original + explain.mode + params
  → POST /api/db/query: valida payload e comando único
  → provider conectado: capabilities medidas
  → registry / strategy: constrói SQL final
  → prepareQuery / query originais: vincula params e executa
  → resposta com explainFormat
  → hook armazena { format, raw }
  → resolveExplainPlan / VisualExplain
```

Exemplo do payload (além da identificação de conexão já existente):

```json
{
  "sql": "SELECT * FROM users WHERE id = $1",
  "params": [7],
  "explain": { "mode": "estimate" }
}
```

`explain` ausente mantém a query normal. Quando presente, precisa ser um objeto
não nulo, não array, com apenas a propriedade própria `mode`, exatamente
`estimate` ou `analyze`. Booleanos, strings, modos desconhecidos e propriedades
extras recebem HTTP 400. Não há interpretação truthy/falsy.

Os códigos estáveis são `EXPLAIN_INVALID_REQUEST`, `EXPLAIN_UNSUPPORTED`,
`EXPLAIN_STATEMENT_UNSUPPORTED` e `EXPLAIN_FORMAT_UNSUPPORTED`. Os três primeiros
são recusas da API; o último identifica resposta incompatível no cliente.
Mensagens desses códigos são traduzidas em `Explain.errors`, em en/pt-BR.
Mensagens originais do database continuam sendo mensagens do database.

O servidor seleciona o formato **depois** de obter o provider conectado. Se não
houver suporte, formato registrado ou estratégia para o pedido, retorna erro e
não chama `provider.query` com o SQL original. Não existe retry executando a query
original, nem promoção de estimate para analyze. Parâmetros permanecem separados,
na mesma ordem, vinculados pelo driver ao statement prefixado. QueryId e o caminho
de cancelamento/paginação continuam os existentes.

## Capabilities e probes

`explainFormat` continua sendo o formato selecionado. O campo opcional
`supportsExplainAnalyze` distingue suporte a medições reais da capacidade de
produzir um plano estimado. Capability não é autorização.

Antes de conectar, PostgreSQL/MySQL mantêm seus formatos estáticos JSON para
metadata. PostgreSQL declara analyze como possibilidade estática; MySQL não.
`provider-meta` continua sem abrir conexão com o banco. A query API usa a medição
da conexão efetiva, não essa suposição estática.

### PostgreSQL

Na conexão normal, sobre o client já adquirido:

1. Tenta `EXPLAIN (FORMAT JSON) SELECT 1`.
2. Se aceito, seleciona JSON e testa separadamente
   `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT 1`.
3. Se estimate JSON foi recusado, tenta `EXPLAIN SELECT 1`; se aceito, testa
   `EXPLAIN ANALYZE SELECT 1`.
4. Sem estimate compatível, declara EXPLAIN indisponível. Aceitar só analyze não
   autoriza inferir suporte a estimate.

São dois ou três probes fixos; nenhum usa SQL ou dados do usuário. Falha de
gramática não falha a conexão. Repetir connect com pool ativo não repete probes;
desconectar e conectar novamente mede outra vez. O client continua liberado pelo
`finally` existente. Não há mudança em métodos de execução ou transação.

O perfil read-only do Agent **não faz probes**; conserva a capability estática e
seu envelope original. O Agent compõe seu próprio EXPLAIN, não usa esta negociação.

### MySQL

Tenta `EXPLAIN FORMAT=JSON SELECT 1` e depois `EXPLAIN SELECT 1`, interrompendo no
primeiro sucesso. Usa o caminho textual existente, sem bound params nos probes.
Sem sucesso, omite explainFormat e declara supportsExplain false. Não identifica
engines por nome, versão ou códigos de erro. Reutiliza a conexão já adquirida.

Este bundle não adiciona EXPLAIN ANALYZE MySQL: as estratégias negociadas produzem
estimativas. O botão passa a pedir `estimate` explicitamente nesse caso; pedidos
diretos de API por `analyze` sem capability são recusados, não ignorados.

| Formato | Estimate | Analyze pela API |
| --- | --- | --- |
| postgres-json | EXPLAIN (FORMAT JSON) | EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON), se medido |
| postgres-text-analyze | EXPLAIN | EXPLAIN ANALYZE, se medido |
| postgres-text | EXPLAIN | Não suportado |
| mysql-json | EXPLAIN FORMAT=JSON | Não suportado neste bundle |
| mysql-text | EXPLAIN | Não suportado neste bundle |

Estratégias existentes de outras engines não foram removidas ou reescritas. Seus
providers permanecem intactos; o hook pede estimate quando não há capability
explícita de analyze. Não é introduzido suporte novo de analyze para essas engines.

## Cliente, versões e renderização

O hook não chama mais `buildSql`. Faz somente preflight com os leitores de SQL
existentes e envia SQL original/mode. Direto: analyze se a metadata declara essa
possibilidade; caso contrário, estimate. Background: sempre estimate. Se uma
engine PostgreSQL-compatible recusar analyze na medição, o pedido direto recebe
erro controlado; o servidor não troca silenciosamente sua intenção.

`provider-meta` inclui `explainRequestVersion: 1` (capability do transporte, não do
banco). Sem esse marcador, o novo cliente não envia requests EXPLAIN; queries
normais continuam funcionando. Isso impede o caso cliente novo/servidor antigo
que simplesmente ignoraria o campo explain e executaria o SQL recebido.

A resposta EXPLAIN deve nomear um formato registrado. Ausência, formato desconhecido
ou chave herdada como `constructor` não usa o formato estático como palpite. A
resposta direta gera erro localizado; background conserva o comportamento de
falha não bloqueante, sem executar outra query para recuperar o plano.

Deploy deve manter cliente e API coerentes; o marcador não é um protocolo de
negociação entre réplicas de versões diferentes. Não executar um rollout com
metadata de uma versão e query API de outra. SQL EXPLAIN digitado manualmente ou
enviado por um cliente antigo continua sendo SQL normal: o servidor não infere uma
intenção ausente. Esta mudança não reclassifica nem neutraliza comandos manuais.

VisualExplain agora apresenta `node.detail` e texto bruto com quebras de linha,
sem JSON-stringificar uma string de plano. O parser MySQL lê a primeira coluna
como nó e as restantes como detalhes; somente estRows numérico vira métrica.
Valores vazios não viram zero. O parser PostgreSQL aceita uma linha por célula ou
um plano inteiro numa célula; atributos de nós marcados com `•` ficam no detalhe,
não viram operadores filhos. Não são inventados custos ou tempos em planos textuais.
Raw SQL, nomes de nós, tabelas, schemas e conteúdo técnico não são traduzidos.

## Segurança, limites e compatibilidade deliberada

- Estimate PostgreSQL não contém a opção ANALYZE. A documentação oficial explica
  que é ANALYZE que executa o statement:
  [PostgreSQL EXPLAIN](https://www.postgresql.org/docs/current/sql-explain.html).
- Preservamos o limite funcional anterior de SELECT/CTE suportado. UPDATE, DELETE
  e INSERT continuam **recusados**, inclusive em estimate, em vez de ampliar o
  produto para DML. Testes estruturais comprovam que não é gerado SQL executável
  para esses casos. Analyze continua recusando CTE com escrita.
- EXPLAIN ANALYZE de DML pode ter efeitos reais. A recusa deste fluxo não altera
  a execução manual pelo editor. Não implementamos uma proteção global do banco.
- Multi-statement é recusado antes do provider, usando o splitter e a gramática
  existentes; não foi instalado parser SQL. Um terminador final não é uma segunda
  query. Strings/comentários são interpretados pelo leitor já existente.
- Não houve mudanças em Query Safety, auth/RBAC, ownership transacional,
  provider cache/factory, storage, visibility, Agent policy/guard/profile,
  consentimento/handover/prompts, grounding, Schema Diff, Create Table ou deploy.
- Futuro Safe Mode poderá avaliar SQL original, intenção e SQL final. Um plano
  estimado pode ser uma fonte opcional, nunca uma promessa de affected-row preview
  exato. Custos de planejamento/permissões/funções continuam responsabilidade do
  database; este bundle não é um sandbox de SQL.

## Testes e adaptações

Asserções cobrem payloads, parâmetros, formatos, recusas sem fallback, SELECT,
DML/multi-statement recusados, estimate sem ANALYZE, analyze textual/JSON, versões
antigas, re-conexão/probes e ausência de probes no Agent. Há fixtures textuais
adaptadas dos dois commits upstream, sem alegar nova medição nas engines originais.

O teste de marketplace precisou reconhecer a declaração de formato medido, como
no upstream; nenhum texto de marketplace foi modificado. Uma asserção do provider
PostgreSQL separa agora probes de connect do teste posterior de queryReadOnly.

| Grupo executado | Aprovados | Falhas |
| --- | ---: | ---: |
| Explain strategies/registry + i18n + marketplace (15 arquivos) | 293 | 0 |
| Query API e provider-meta (2) | 56 | 0 |
| Hook de execução e metadata (2) | 115 | 0 |
| VisualExplain (1) | 62 | 0 |
| PostgreSQL provider (1) | 147 | 0 |
| MySQL provider (1) | 116 | 0 |
| Agent grounding/tools/plan summary (4) | 504 | 0 |
| Policy/statement guard/execution/gates (5) | 204 | 0 |
| **Total: 31 arquivos** | **1497** | **0** |

Os testes foram separados em processos/grupos compatíveis para não misturar mocks
globais. Usamos mocks/fixtures, sem containers, credenciais ou banco do usuário,
sem DML real e sem LLM real. Não foi repetida a suíte agregada do Windows.
Nenhuma falha preexistente ficou pendente nos conjuntos escolhidos; problemas
Windows conhecidos não foram corrigidos. O relatório final registra os gates de
typecheck, lint, build e diff-check após a revisão.

Gates finais: `bun run typecheck` sem erros; `bun run lint` sem erros e com os
mesmos 131 avisos conhecidos; `bun run build` concluído; `git diff --check`
aprovado. Os avisos de LF/CRLF do Git não motivaram normalização ampla. Diferenças
incidentais de formatação em trechos antigos do VisualExplain foram retiradas.

## Omissões upstream

- SHOW STATUS bare/filtragem local e mudanças de métricas/ausência: independentes
  dos probes EXPLAIN e fora do escopo estrito de monitoring autorizado.
- Reclassificações de compatibilidade, benchmarks reais, e2e wire/docker,
  marketplace/deploy copy e grandes revisões históricas de docs: não são requisitos
  deste bundle, nem resultados medidos no fork.
- Comentário em Agent plan-summary: seu mapa parcial já degrada formatos não
  conhecidos para unknown; não exige alteração funcional do Agent.
- Fallback upstream para formato estático no browser: omitido para não interpretar
  um formato desconhecido como outro plano.
- Ignorar mode em PostgreSQL JSON/text puro: substituído pela separação explícita
  de modos e recusa quando o modo não está disponível.

Somente arquivos deste checkpoint devem entrar no commit
`fix: move explain strategy selection server-side`. Os documentos históricos
`docs/FORK_BASELINE.md` e `docs/INTERNAL_ARCHITECTURE_MAP.md` ficam intocados/untracked.
Não publicar, iniciar Safe Mode ou outro bundle como parte desta tarefa.
