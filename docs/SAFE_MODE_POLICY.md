# Production Safe Mode — policy determinística, Fase 6B.2

## Estado e fronteira

Base: `a2acf3f268b33d5504025bed4934b4c59a199cd3`, branch `feat/dbstudio-custom`, ahead 6 / behind 0.
Esta fase acrescenta somente uma policy pura, configuração tipada, testes e documentação.
**Safe Mode não está ativo; nenhuma execução real mudou.**

Fluxo arquitetural: classifier existente → policy → futuro coordinator server-side.
O classifier descreve evidências sintáticas; a policy recomenda uma exigência no contexto recebido;
o coordinator futuro deverá estabelecer autoridade, confirmar quando necessário e aplicar o resultado.
A recomendação atual não possui efeito operacional sozinha.

Não há integração com APIs, providers, Agent, Query Safety ou UI. Não há challenge, nonce, TTL, token,
HMAC, JWT jti, endpoint de confirmação, bypass administrativo ou nova tradução.
Nenhuma dependência, lockfile, configuração de deploy ou arquivo preexistente foi alterado.

## Arquivos e contrato

Produção (todos novos em `src/lib/safe-mode/`):

- `policy.ts`: `evaluatePolicy`, agregação e tratamento de estruturas/evidências; não lê SQL ou parâmetros.
- `policy-types.ts`: ações, riscos, ambientes, perfis, níveis e entrada/saída.
- `policy-rules.ts`: matriz declarativa, reason codes de regras e `SAFE_MODE_POLICY_VERSION = 1`.
- `config.ts`: defaults, tipos de override gerenciado e merge/validação determinísticos.

Nenhuma mudança em `classify.ts`, `lex.ts`, `types.ts`, `limits.ts` ou adapters da Fase 6B.1b.
Não se repetem tokenização, classificação ou análise por regex dentro da policy.
O modelo experimental e as evidências dos checkpoints anteriores permanecem intactos.

Entrada:

```ts
evaluatePolicy({
  classification,          // SqlClassification produzido no servidor
  effectiveEnvironment,    // contexto autoritativo a ser resolvido na 6C.1
  config,                 // opcional; resultado de resolvePolicyConfig
});
```

Saída:

- `decision` e `aggregateDecision`: `allow | warn | require_confirmation | block` (iguais no resultado final).
- `risk`: `low | medium | high | critical`, separado da ação.
- `reasonCodes`: códigos estáveis, únicos, ordenados lexicograficamente.
- `policyVersion`: 1, independente da versão do pacote.
- `statementDecisions`: ordem original, operação, filhos e decisão individual.
- `confirmationLevel`: `standard | strong`, presente apenas quando a ação é require_confirmation.
- `analysisLimitations`: limitações de análise consumidas do classifier, deduplicadas/ordenadas.
- `effectiveEnvironment` e `profile`: contexto/perfil efetivos da avaliação.

Filhos têm `execution: executed | not-executed | unknown`, relativo ao pai.
Uma decisão individual de um filho não executado NÃO deve virar exigência do batch por fora do agregado.
A policy preserva a informação para inspeção, mas o coordinator deverá usar a decisão agregada.

`allow` não significa pureza universal, autorização RBAC ou aceitação pelo banco. A policy não inspeciona
objetos, funções, views, RLS, triggers, operadores ou permissões nativas. Esses limites do classifier continuam.

## Ambientes, perfis e autoridade

| effectiveEnvironment | Perfil fixo | Intenção |
| --- | --- | --- |
| local | local | Permissivo com avisos para riscos; DROP DATABASE ainda exige confirmação forte |
| development | development | Mais avisos e confirmações; sem bypass para DROP DATABASE |
| staging | conservative | Conservador, bloqueia operações sem escopo e entradas desconhecidas |
| production | strict | Estrito; bloqueia incerteza e efeitos desconhecidos |
| other | conservative | Igual a staging, nunca convertido automaticamente em local |

Valores fora do enum em runtime, inclusive custom/unknown, caem em other/conservative.
Não há canonicalização de labels livres como PROD: a 6C.1 deve entregar o enum correto.
Não há leitura de `connection.environment`, browser, storage, localStorage, navigator ou process.env.
O nome effectiveEnvironment não prova a origem: a autoridade real ainda precisa ser implementada.
O tipo não inclui actorRole; uma propriedade extra admin não muda decisões.

## Matriz-base de evidência COMPLETA

Legenda: A = allow; W = warn; C = require_confirmation standard; S = require_confirmation strong; B = block.
Esta tabela pressupõe operação completamente reconhecida, sem incertezas ou efeitos adicionais.
Os testes usam fixtures estruturais completas para não fingir que o classifier atual valida DDL completo.

| Operação/evidência | Local | Development | Staging/Other | Production |
| --- | --- | --- | --- | --- |
| SELECT simples | A | A | A | A |
| SELECT + indirect/unknown-effects | W | W | S | B |
| INSERT simples | A | W | W | W |
| UPDATE com WHERE | A | W | C | C |
| UPDATE sem WHERE ou WHERE unknown | W | C | B | B |
| DELETE com WHERE | A | W | C | C |
| DELETE sem WHERE ou WHERE unknown | W | C | B | B |
| CREATE TABLE / INDEX / VIEW | A | W | W | C |
| ALTER TABLE | W | W | C | S |
| DROP TABLE | W | C | S | S |
| TRUNCATE | W | C | S | S |
| DROP DATABASE | S | B | B | B |
| DROP INDEX / VIEW | W | W | C | C |
| GRANT / REVOKE | W | C | S | S |
| ANALYZE | A | A | W | W |
| VACUUM | A | W | W | C |
| VACUUM FULL | W | C | S | S |
| REINDEX | W | C | C | S |
| BEGIN / COMMIT / ROLLBACK / SAVEPOINT / RELEASE claros | A | A | A | A |
| SET / controle de sessão reconhecido | W | W | W | C |
| PRAGMA não provado como leitura | W | W | C | B |
| ATTACH / DETACH | W | C | S | B |
| CALL / DO / EXEC / EXECUTE | W | C | B | B |
| EXPLAIN estimate completo, sem execução/efeitos desconhecidos | A | A | A | A |
| EXPLAIN ANALYZE SELECT completo | W | W | C | C |

EXPLAIN ANALYZE de escrita também recebe as exigências da escrita subjacente, usando o máximo.
WHERE é apenas evidência estrutural: não prova seletividade nem segurança. WHERE ausente/unknown não
ganha o tratamento de WHERE presente. Não há Run anyway em produção para os casos bloqueados.
Não se analisa a subforma de ALTER nem se infere cardinalidade/impacto exato nesta fase.

## Precedência de incerteza e agregação

| Evidência adicional | Local | Development | Staging/Other | Production |
| --- | --- | --- | --- | --- |
| partial | W | W | S | B |
| unknown-effects, mesmo com status classified | W | W | S | B |
| unknown / invalid | W | C | B | B |
| unsupported (dialeto ou statement) | W | C | B | B |
| limit-exceeded | W | C | B | B |

Esses níveis são pisos, não substituições. Nunca reduzem a regra da operação já reconhecida.
Exemplo: DROP DATABASE partial local mantém S, em vez de virar W.
Escrita/schema/maintenance sem subtipo conhecido também recebem um piso conservador, sem se tornarem leitura.
Nenhum SQL ou parâmetro bruto é consultado para tentar melhorar a classificação.

**Consequência deliberada com o classifier atual:** DDL, maintenance e INSERT SELECT geralmente são partial
com unknown-effects. Em produção são bloqueados. DROP TABLE real, por exemplo, não passa pela confirmação
forte da matriz-base enquanto essa incerteza existir. Não foi enfraquecida a policy para produzir menos blocks.

Ordem total: A < W < C < S < B. O batch recebe o máximo de todos os statements e de sua incerteza global.
Adicionar um statement permissivo não reduz block nem confirmação forte. Filhos de CTE executáveis também
participam do máximo. A ordem das decisões individuais segue a entrada, não a gravidade.

Estimate/CREATE VIEW podem ter filhos não executados. Seus efeitos de execução não são cobrados do pai,
mas incerteza, unknown-effects e efeitos indiretos de planejamento não ganham aprovação por essa aresta.
Um `executesChildren: false` fora dessas estruturas não oculta filhos; ANALYZE nunca usa essa dispensa.
ROLLBACK claramente classificado continua allow isoladamente; um batch arriscado que inclui ROLLBACK ainda
é avaliado como batch. Ownership e contexto transacional completo ficam para 6C.

Monotonicidade é testada mantendo os efeitos/identidade da entrada e agravando status/incerteza. Trocar o
dialeto e apagar evidências não é a mesma entrada: sem classificação anterior a policy não pode reconstruir
um DROP DATABASE a partir de unsupported vazio. A identidade/contexto autoritativos da 6C.1 são indispensáveis.

## Risk e reason codes

Risk é o máximo dos riscos aplicáveis, não um alias de decision:

- low: leitura direta e controle transacional claro;
- medium: INSERT, CREATE, ANALYZE/VACUUM normal e EXPLAIN ANALYZE de leitura;
- high: UPDATE/DELETE com WHERE, ALTER, permissões, controle e análise incerta;
- critical: UPDATE/DELETE sem escopo comprovável, DROP TABLE/DATABASE, TRUNCATE e execução indireta explícita.

Uma configuração pode bloquear uma leitura de risk low sem reescrever seu risco como critical.
Filhos não executados não transformam automaticamente o risk do estimate em risco de DELETE executado.

Reason codes de regras (fonte única: POLICY_RULES):

```text
READ_OPERATION INSERT_OPERATION
UPDATE_WITH_WHERE UPDATE_WITHOUT_WHERE UPDATE_WHERE_UNKNOWN
DELETE_WITH_WHERE DELETE_WITHOUT_WHERE DELETE_WHERE_UNKNOWN
CREATE_SCHEMA_OBJECT ALTER_TABLE DROP_TABLE DROP_DATABASE DROP_INDEX_OR_VIEW TRUNCATE
PRIVILEGE_CHANGE ANALYZE VACUUM VACUUM_FULL REINDEX TRANSACTION_CONTROL
SESSION_CONTROL SQLITE_PRAGMA SQLITE_ATTACH_DETACH INDIRECT_EXECUTION INDIRECT_READ
UNKNOWN_CLASSIFICATION PARTIAL_CLASSIFICATION INVALID_CLASSIFICATION UNSUPPORTED_CLASSIFICATION
LIMIT_EXCEEDED UNKNOWN_EFFECTS EXPLAIN_ANALYZE
UNRECOGNIZED_WRITE UNRECOGNIZED_SCHEMA_CHANGE UNRECOGNIZED_MAINTENANCE
```

Códigos contextuais: WRITE_OPERATION, SCHEMA_CHANGE, MULTI_STATEMENT, PRODUCTION_ENVIRONMENT,
OTHER_ENVIRONMENT_CONSERVATIVE, SERVER_POLICY_OVERRIDE. Limitações do classifier continuam códigos técnicos,
não mensagens de UI. Nenhum catálogo en/pt-BR foi alterado. A tradução desses códigos fica para outra fase.

## Configuração server-managed, sem loader/variáveis de ambiente

`resolvePolicyConfig(globalOverride?, managedConnectionOverride?)` implementa somente modelo, validação e merge.
Não lê env/filesystem/storage. Portanto não foi necessário criar loader server-only neste checkpoint.
Não existe nenhuma NEXT_PUBLIC security config, toggle client-side ou associação com conexões reais.
A configuração pura pode ser testada sem Next; a futura obtenção de configurações deve ficar no servidor.

Exemplo de override confiável:

```ts
const config = resolvePolicyConfig(
  { policyVersion: 1, profiles: { strict: { INSERT_OPERATION: "confirm_standard" } } },
  { profiles: { strict: { INSERT_OPERATION: "confirm_strong" } } },
);
```

Formato `TrustedPolicyOverride`: policyVersion opcional = 1, profiles opcionais local/development/conservative/strict,
com mapas parciais de RuleId para `allow | warn | confirm_standard | confirm_strong | block`.
O mapeamento ambiente→perfil é fixo e não é configurável pelo cliente nem pelo override.

Regras do merge:

1. Config ausente/undefined → defaults seguros em código; `{}` também mantém os defaults.
2. Global e depois conexão gerenciada: só elevação, nunca redução de um nível já definido.
3. Elevar perfil inferior propaga o piso aos superiores, preservando monotonicidade de ambiente.
4. TRANSACTION_CONTROL não pode ser elevado por override; protege a disponibilidade de recuperação/ROLLBACK.
5. Resultado versionado e profundamente congelado; entradas não são modificadas.
6. Ordem de inserção de propriedades não altera resultado ou ordem de códigos.

Config inválida lança PolicyConfigError; não é ignorada nem substituída silenciosamente por algo mais permissivo.
São rejeitados: null explícito, arrays, strings, getters, propriedades não enumeráveis, chaves desconhecidas,
perfis/regras inexistentes, valores inválidos, versão incompatível e downgrade. O evaluator também rejeita
configuração não resolvida, em vez de confiar em um cast TypeScript. Códigos de erro: INVALID_CONFIG,
UNKNOWN_CONFIG_KEY, POLICY_VERSION_MISMATCH, PROTECTION_DOWNGRADE, RECOVERY_RULE_OVERRIDE.

O marcador tipado de config resolvida evita uso acidental de JSON cru; **não é autenticação nem prova de origem**.
Quem controla código JavaScript no processo continua fora dessa fronteira. Antes de enforcement será obrigatório
obter override somente de fonte server-managed e tratar falhas de configuração sem retry permissivo.

## Corpus: custo de UX e gate crítico

221 casos × 4 ambientes = **884 avaliações reais classifier → policy**.
O corpus/fingerprint da 6B.1 e resultados da 6B.1b não foram alterados.

| Ambiente | Allow | Warn | Confirmação standard | Confirmação strong | Block | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Local | 83 | 136 | 0 | 2 | 0 | 221 |
| Development | 59 | 76 | 84 | 0 | 2 | 221 |
| Staging | 59 | 4 | 22 | 64 | 72 | 221 |
| Production | 59 | 4 | 22 | 0 | 136 | 221 |

Production: **132/132 críticos avaliados, zero allow**. Além disso, o teste define pisos independentes
por categoria, não só "diferente de allow": DELETE/UPDATE sem WHERE e DROP DATABASE exigem block;
com WHERE exigem ao menos confirmação; DDL destrutivo/permissões têm piso forte; INSERT simples pode warn.
Todos esses gates passaram. As confirmações fortes da matriz-base DDL são substituídas por block no corpus
real de produção devido à incerteza atual, não por falha do nível strong.

Dos 136 blocks em produção, **103 têm SQL válido no oracle**:

- 20 têm classificação completa e bloqueio deliberado da matriz, por exemplo DELETE sem WHERE;
- 82 têm classificação partial;
- 1 é unknown (SELECT de target list vazia no PostgreSQL, deliberadamente fora do subconjunto).

SQL válido não significa operação autorizada/legítima: 103 não é uma taxa medida de falsos bloqueios.
O custo conservador inclui SQL potencialmente legítimo: INSERT SELECT, DDL gerado, maintenance, funções,
joins e subqueries de escrita. Dois casos de leitura sintática pura no oracle também são bloqueados:
`postgres/cast` e `postgres/json`, por classificação partial. A lista completa está no artefato.
Esses números descrevem um corpus adversarial, não a distribuição de uso real. Não houve otimização permissiva de UX.

## Testes, evidência e performance

Arquivos novos em `tests/unit/safe-mode/`:

- `policy-fixtures.ts`: matriz independente com evidência completa e helpers de testes;
- `policy.test.ts`: matriz por ambiente, precedência, batch, filhos, EXPLAIN, pureza e invariantes;
- `policy-config.test.ts`: defaults, overrides, erros, versão, ordem, ausência de downgrade e recuperação;
- `policy-corpus.test.ts`: 221 casos, 132 críticos, pisos por categoria, monotonicidade e artefato;
- `evaluate-policy.ts`: avaliação offline e microbenchmark;
- `policy-evaluation-results.json`: 884 observações, distribuições, blocks válidos e tempos.

Invariantes: block não diminui no batch; partial/unknown/unsupported/unknown-effects não reduzem proteção
mantendo evidências; ambientes são monotônicos; DROP DATABASE e escritas sem WHERE ficam bloqueados em
produção; DROP TABLE/TRUNCATE nunca allow; admin não dá bypass; razões são determinísticas; SQL e parâmetros
possuem getters que lançam erro nos testes para provar que não são lidos. Matriz e config não usam IA/RBAC.

Benchmark: apenas evaluatePolicy é cronometrada; classificação e preparação ficam fora. 100 warmups por caso.
Bun 1.4.0, process.version v26.3.0, Windows 10.0.19045, Intel Core i5-10210U.

| Cenário | Nós | Iterações | Média registrada |
| --- | ---: | ---: | ---: |
| Leitura simples | 1 | 20.000 | 0,002845 ms |
| Batch 50 statements | 50 | 2.000 | 0,081960 ms |
| Maior árvore do corpus (migration-alter PostgreSQL) | 7 | 5.000 | 0,014485 ms |

É uma média local sem SLA. Custo essencialmente linear nos nós/efeitos do resultado bounded do classifier,
com vocabulário fixo de razões; configuração é resolvida antes da avaliação. Nenhum banco foi acessado no benchmark.
O core espera uma árvore válida do classifier, não JSON arbitrário ou grafo cíclico enviado pelo cliente.

Reproduzir:

```sh
bun test tests/unit/safe-mode
bun run tests/unit/safe-mode/evaluate-policy.ts
# Regrava apenas a evidência desta fase:
bun run tests/unit/safe-mode/evaluate-policy.ts --record
```

Validações finais deste checkpoint:

| Grupo/comando | Resultado |
| --- | --- |
| `bun run typecheck` | Zero erros |
| `bun run lint` | Zero erros; 131 warnings ESLint preexistentes, além dos avisos oxlint existentes |
| Safe Mode: classifier/spike + policy/config/corpus/invariantes | 1.200 aprovados, 0 falhas (612 novos + 588 existentes) |
| Agent statement guard + EXPLAIN | 334 aprovados, 0 falhas |
| QuerySafetyDialog | 113 aprovados, 0 falhas |
| Total sem duplicar reruns | 1.647 aprovados, 0 falhas, 23 arquivos de teste |
| `bun run build` | Sucesso, 39/39 páginas; compilação 53s, TypeScript 26s |

Lint direcionado aos arquivos novos: zero erros e warnings. Não ocorreram falhas de Windows paths/SQLite EBUSY
nesses grupos. Permanecem os avisos de lockfile externo ao Git e quatro avisos de tracing (Agent config,
DuckDB, SQLite e seed loader), sem alteração oportunista. Diff check é aplicado antes do commit, inclusive staged.

## Readiness e pré-condições da 6C

**SIM: a policy pura está pronta para o futuro coordinator server-side, condicionado a trusted context
ser implementado e validado antes de qualquer enforcement.** Não há autorização implícita para iniciar 6C.

Antes de aplicar decisões a execuções reais:

1. Resolver conexão/dialeto/ambiente no servidor, sem aceitar downgrade da metadata do browser.
2. Resolver identidade/cache do provider e contexto/ownership transacional.
3. Classificar o SQL efetivamente enviado após builders/rewrites; vincular SQL + parâmetros + conexão/contexto
   e policyVersion em snapshot imutável para evitar divergência entre análise e execução.
4. Implementar coordinator e protocolo de confirmação separadamente, sem Run anyway normal para block.
5. Manter permissões nativas/read-only/budgets e RBAC independentes. Policy allow não garante DB allow;
   DB allow também não substitui policy.
6. Preservar guard/policy/profile do Agent. Composição futura será por interseção de restrições,
   não substituição pelo Safe Mode. Não reutilizar score de IA do Query Safety como autoridade.
7. Tratar config inválida/resultado inválido como falha da fronteira, sem fallback permissivo.

Limitações restantes: classificação parcial frequente, nenhuma pureza universal de funções/views/RLS,
nenhuma autoridade de conexão já implementada, ausência de contexto transacional completo e de confirmação.
Não se deve usar `statementDecisions` isoladamente para executar partes aprovadas de um batch bloqueado.

## Escopo preservado

Sem alterações em API routes, providers/factory/cache, auth/RBAC, storage, resolveConnection, Agent,
Query Safety, EXPLAIN, Schema Diff, Create Table, visibility ou deploy. Zero enforcement e zero nova dependência.
Os documentos históricos FORK_BASELINE.md e INTERNAL_ARCHITECTURE_MAP.md permanecem untracked e intocados.
Commit somente local; sem push/PR/merge/rebase/tag/release. Parar antes da Fase 6C.
