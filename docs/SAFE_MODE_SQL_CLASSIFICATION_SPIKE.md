# Fase 6B.1 — corpus e avaliação de classificação SQL

Avaliação: 2026-09-11. Revisão/checkpoint: 2026-09-14.
Baseline: `1eedccf752790b565adad2ae069158e7a1e1f700`
(`fix: move explain strategy selection server-side`). Branch inicial:
`feat/dbstudio-custom`, tracking `origin/feat/dbstudio-custom`, **ahead 4**.
Somente `FORK_BASELINE.md` e `INTERNAL_ARCHITECTURE_MAP.md` estavam untracked.

## Decisão

**Resultado B: spike/corpus, sem classificador de produção e sem dependência nova.**
Não há Safe Mode ativo. Nenhuma API, consulta, provider, factory, capability,
Query Safety, Agent, EXPLAIN, cache, ownership, storage, UI ou tradução foi alterada.
Nada neste diretório de testes deve ser importado pela aplicação.

Não adotar `node-sql-parser@5.4.0` nem `pgsql-ast-parser@12.0.2` como fronteira de
classificação para policy. Ambos oferecem AST útil, mas a evidência abaixo não
satisfaz os critérios de segurança/cobertura desta fase. Uma rejeição conservadora
resolve sintaxe não suportada, **não resolve SQL aceito cuja AST perdeu comandos**.

## Artefatos e método

Todos os arquivos de código desta fase estão em `tests/unit/safe-mode/`:

| Arquivo | Responsabilidade |
| --- | --- |
| `model.ts` | Especificação de saída/oráculo, sem função de classificação de SQL |
| `corpus.ts` | Casos identificados por dialect, SQL, propósito e resultado esperado |
| `generated-cases.ts` | DDL obtido dos geradores reais de Create Table e Schema Diff |
| `observe.ts` | Observador experimental de AST injetada; não é adapter de produção |
| `evaluate.ts` | CLI opt-in, carrega parsers externos instalados isoladamente, mede e registra |
| `evaluation-results.json` | Evidência integral por caso, versões, fingerprint, ambiente e tempos |
| `corpus.test.ts` | Integridade do oráculo, cobertura de requisitos e fingerprint da evidência |
| `observe.test.ts` | Ausência de fallback, dialect não suportado, WHERE próprio e falhas registradas |
| `existing-utilities.test.ts` | Caracterização executável das limitações de módulos atuais |

São **221 casos**: 80 PostgreSQL, 72 MySQL, 68 SQLite e 1 provider não suportado.
Cada parser recebe o script inteiro, sem pré-processamento pelo splitter atual.
O oráculo foi escrito independentemente da resposta dos parsers. As expectativas
descrevem sintaxe/efeitos explícitos, não garantem ausência de triggers, regras,
RLS, views, funções, extensões ou efeitos implícitos no banco.

As métricas distinguem três coisas:

1. `parsedValid`: o parser aceitou um caso de sintaxe válida do corpus.
2. `projectionMatches`: uma projeção pequena encontrou o mesmo multiconjunto de
   operações, flags WHERE dos modificadores e quantidade de statements externos.
3. Classificação segura: **não entregue nem medida como taxa de sucesso**.

A projeção não valida toda a AST, semântica, alvos de DML, ordem de execução de
CTEs, opções EXPLAIN ou efeitos implícitos. Divergência de projeção não significa
necessariamente defeito no parser: diferenças de formato em nós ALTER de
MySQL/SQLite, `transaction`/`start transaction` e campos `into` precisam de adapters
específicos. Os paths registrados permitem inspecionar propriedade do WHERE;
comparar multiconjuntos não prova a topologia completa. `parsedMissingWrite`
mede ausência de operações DML esperadas, não todos os efeitos possíveis.

`syntax: invalid` é uma expectativa independente; erro do parser NÃO prova que o
banco rejeitaria aquela sintaxe. Foi verificada uma sutileza importante:
PostgreSQL admite SELECT com lista de projeção vazia. O caso `postgres/incomplete-select`
é marcado com **sintaxe válida**, mas `expected.status: unknown`, pois o fragmento
do editor permanece fora do subconjunto de leitura reconhecida proposto nesta fase.
Não contamos sua aceitação como falso positivo do parser.

## Inventário completo das utilities atuais

Não há parser AST completo em `src/lib/sql/`. Há scanners estruturais e auxiliares
com objetivos distintos. Nenhum foi modificado.

| Módulo | Entrada → saída / mecanismo | Limite relevante para autorização |
| --- | --- | --- |
| `grammar.ts` | `DatabaseType?` → fatos de `#`, colchetes, comentários aninhados, q-quoting, `//` | Tabela parcial e default de compatibilidade para desconhecidos; não é gramática completa. SQL modes/versão/charset não modelados |
| `spans.ts` | SQL, offset, grammar → span opaco, fim e `terminated` | Scanner de strings, quoted identifiers, dollar strings, comentários e subscripts. Não valida sintaxe. Backslash antes de delimitador é ambíguo mesmo com dialect. Dollar quoting/backticks não são restritos a dialect; `--` não exige whitespace MySQL; `/*!...*/` é opaco |
| `words.ts` | SQL/offset → palavra ou posição de palavra em código | Exclui spans, mas nome não delimitado e keyword têm o mesmo formato. Não conhece escopo sintático; `findCodeWord('WHERE')` não identifica o WHERE externo |
| `leading-keyword.ts` | SQL/grammar → keyword e offsets ou null | Ignora trivia e mantém compatibilidade de `#` inicial em qualquer dialect e whitespace JS. Não valida o restante; SELECT incompleto pode fornecer keyword |
| `operative-keyword.ts` | SQL/grammar → comando após lista WITH | Conta parênteses e atravessa spans; lê CTE padrão/materialized e forma de expressão ClickHouse. Pula corpos, não agrega efeitos. SEARCH/CYCLE e algumas formas inválidas têm limitações documentadas |
| `statement-splitter.ts` | SQL/grammar → fragments `{sql,startLine,start,end}` | Separa em `;` fora de spans, conserva posição/ordem; não valida sintaxe, perde sinal de span não terminado e pode manter fragmento só de comentário. Não é parser de rotinas/DELIMITER |
| `statement-end.ts` | SQL/grammar → `{end,rewritable}` | Localiza ponto antes de terminador/trivia para LIMIT, recusa corte ambíguo; não prova segurança nem statement único |
| `alias-extractor.ts` | SQL/opções → mapa de aliases FROM/JOIN/CTE | Regex/preprocessamento de comentários e literais para autocomplete; não usa toda a gramática dos scanners. Apropriado para sugestões, não autorização |
| `types.ts` | Tipos de aliases e opções | Não há modelo de efeitos/classificação |
| `index.ts` | Reexporta alias extraction/resolution | Não é registry de parsers |
| `identifier.ts` | Nome/dialect → identificador quoted; predicate bare | Gera SQL, não interpreta intenções nem valida comandos |
| `values.ts` | Literal/dialect ou posição → escaping/placeholder | Geração de SQL e parâmetros, não classificador |
| `optimizer-hints.ts` | SQL → boolean de marcadores `/*+`, `/*!`, `--+` fora de literais | Detecta presença sob grammar default, não interpreta efeito de comentário executável nem contexto de versão |
| `fence-tags.ts` | Tag Markdown → query tag / engine ou null | Vocabulário para blocos de texto/Agent; não interpreta o SQL contido |

### Query limiter

`src/lib/db/utils/query-limiter.ts` recebe SQL e dialect opcional.
`analyzeQuery` retorna tipo SELECT/INSERT/UPDATE/DELETE/DDL/OTHER, LIMIT/OFFSET,
CTE/UNION/subquery. Combina operative keyword, statement end, spans, code words e
regex de bounds. Em spans não resolvidos conserva alguns probes textuais apenas
para reporting; `applyQueryLimit` recusa reescrita ambígua. A saída de aplicação é
SQL reescrito, `wasLimited`, bounds e offsets, não uma decisão de segurança.

No corpus: CTE com DELETE interno e SELECT externo é `SELECT`; SELECT seguido de
DELETE também é `SELECT` quando a função recebe o buffer completo. Isso não
constitui defeito novo no contrato do limiter: mostra por que não o promover a
classificador de autorização. Não identifica WHERE modificador nem agrega efeitos.

### Detector de Query Safety

`src/components/QuerySafetyDialog.tsx:isDangerousQuery(query, databaseType?)`
retorna boolean para disparar UX de confirmação/análise. Usa `readsSqlText`,
grammar, spans não terminados, operative keyword e code-word scanner; depois
aplica a mesma detecção aos fragments do splitter. Para MongoDB/Redis consulta
vocabulário separado. Não retorna classificação, motivo estruturado, WHERE ou policy.

Reconhece DELETE/DROP/TRUNCATE/ALTER/GRANT/REVOKE/UPDATE no comando operativo e
UPDATE seguido de SET em qualquer código. INSERT, CREATE, manutenção e função
arbitrária não fazem parte desse vocabulário. **CTE DELETE com SELECT externo não
dispara**, enquanto CTE UPDATE/SET dispara. Comentários/literais/quoted identifiers
ordinários não inventam escrita; spans ambíguos podem causar confirmação excessiva.
O lote comum SELECT;DELETE é detectado. Os dois casos MySQL críticos abaixo não são.
Não foi corrigido/substituído: é UX existente, fora do enforcement desta fase.

### Statement guard do Agent

`src/lib/db/operations/statement-guard.ts:inspectAgentStatement(sql, options?)`
retorna violation ou null. Zod strict wrappers também validam o input `{sql}`.
Usa grammar default, recusa spans ambíguos, dollar quoting/`#`, segundo statement,
comando fora de SELECT/VALUES/TABLE/EXPLAIN e palavras de efeitos em código;
ANALYZE/ANALYSE depende da opção explícita de plan execution.

Detecta DML interno em CTE e statement adicional. Tem falsos positivos intencionais
(dollar literal, operadores `#>`, identificadores bare que coincidem com palavras
recusadas). `SELECT dangerous_function()` e sintaxe malformada com cabeça SELECT
podem retornar null. **Null não é prova de segurança**, conforme contrato atual:
a fronteira do Agent continua sendo perfil nativo read-only/least-privilege.
Não reutilizar sua allowlist como policy universal do editor.

## Modelo proposto (somente especificação de testes)

`ClassificationExpectation` contém:

- `status`: `classified | partial | unknown | invalid | unsupported`;
- `statements`: lista na ordem textual dos comandos externos;
- `aggregateEffects`: união ordenada/deduplicada de efeitos potencialmente executados;
- `limitations`: razões explícitas para abstenção/limitação.

Cada statement guarda `category`, `operation`, `effects`, `children`, `hasWhere`
quando UPDATE/DELETE, `scopeIsSafe: not-proven`, `explainMode` e
`executesChildren` quando relevantes. Categorias: read, write, schema, privilege,
maintenance, transaction, control, indirect, unknown. Efeito adicional:
`unknown-effects`. Operações diferenciam DROP TABLE/DATABASE/INDEX/VIEW,
CREATE TABLE/INDEX/VIEW, ALTER TABLE, TRUNCATE, VACUUM/VACUUM FULL etc.

`hasWhere` responde sobre o predicado da operação correspondente. Não deriva de
string, comentário, RETURNING ou subquery. WHERE true/1=1 continua `hasWhere: true`
e `scopeIsSafe: not-proven`; nenhum cálculo de seletividade/cardinalidade foi feito.

CTEs guardam efeitos internos em children. A ordem textual de CTEs não implica ordem
de execução garantida pelo PostgreSQL. INSERT SELECT agrega write/read.
CREATE VIEW retém SELECT como definição não executada. EXPLAIN estimate conserva
o comando subjacente mas não agrega seu write; ANALYZE agrega efeitos da execução.
Não se afirma que planejamento seja livre de efeitos de extensões/funções mal
declaradas. `context` no caso de teste separa originalSql, intent e effectiveSql;
o classificador futuro deverá analisar o SQL exato de cada estágio, sem confiar
em intenção enviada pelo browser como prova sobre o SQL final.

Funções e procedimentos ficam partial/indirect/unknown-effects. A função `aggregate`
somente combina um oráculo explícito; não extrai efeitos de SQL. Parser rejection
é `parse-rejected` no observador, nunca read/allow. Um adapter futuro deve escolher
unknown/partial conservadoramente, sem chamar erro de sintaxe do banco ao que pode
ser apenas sintaxe válida não suportada pelo parser. Provider desconhecido é
unsupported antes de chamar qualquer parser. Não há environment, role, allow/block,
confirmação, bypass de admin ou policy no modelo.

## Cobertura e evidências dos candidatos

| Candidato/dialect | Casos válidos aceitos | Projeções mínimas coincidentes | Inválidos aceitos |
| --- | ---: | ---: | ---: |
| node-sql-parser 5.4.0 / PostgreSQL | 54/71 | 46 | 0/8 |
| node-sql-parser 5.4.0 / MySQL | 56/62 | 45 | 0/9 |
| node-sql-parser 5.4.0 / SQLite | 39/55 | 38 | 2/12 |
| pgsql-ast-parser 12.0.2 / PostgreSQL | 52/71 | 50 | 1/8 |
| pgsql-ast-parser / MySQL e SQLite | Não suportados; não chamados | — | — |

Não são percentuais de segurança nem estimativas para SQL de produção. O corpus é
dirigido/adversarial, não amostra estatística de workloads. Os detalhes de todos os
casos, inclusive rejeições, estão no JSON; 221 × 2 = 442 observações registradas.

### Falhas críticas observadas (sem execução no banco)

1. MySQL `SELECT 1; /*!50000 DELETE FROM users */;`: node-sql-parser devolve somente
   SELECT; a gramática MySQL executa o corpo versionado em versão compatível.
2. MySQL `SELECT 1--1; DELETE FROM users;`: node-sql-parser trata o restante como
   comentário e perde DELETE. MySQL exige whitespace/control após `--`; aqui é
   aritmética. Os scanners/detector atuais também perdem o segundo comando.
3. SQLite: node-sql-parser aceita `# ...\nSELECT 1` e `TRUNCATE TABLE users`, embora
   essas formas não pertençam à gramática SQLite. Aceitação não valida dialect.
4. PostgreSQL: pgsql-ast-parser aceita `SELECT 1 /* DELETE`, comentário não terminado.
   Chamar essa AST de leitura reconhecida fabricaria confiança.

Nos casos 1/2 há **falsos negativos potenciais perigosos numa policy baseada na AST**:
uma escrita não aparece nela. Aqui não houve bypass real porque nada foi integrado.
Os casos 3/4 são falsos positivos de aceitação sintática; rejeições de SQL válido
são lacunas de cobertura que, sob futura abstenção estrita, causariam bloqueios
excessivos. Falsos positivos de projeção são separados de falhas da biblioteca.

### Detalhes por família

- DML básico com/sem WHERE funciona nas projeções dos dois candidatos onde aplicável.
  Casos com WHERE em string/comentário/subquery não viram predicate externo no
  observador; RETURNING tem cobertura irregular no node-sql-parser.
- PostgreSQL: casts, JSON operators, quoted identifiers, dollar quote e os dois
  CTEs modificadores principais entram no corpus. node-sql-parser aceita estes dois
  CTEs, mas rejeita o lote de CTEs com DELETE sem WHERE e leitura aninhada. Não se
  extrapola suporte a toda CTE; pgsql-ast-parser preserva estes corpos modificadores.
- MySQL: backticks, double-quoted string no modo default, hash comment, multi-table
  UPDATE/DELETE com/sem WHERE, OUTFILE, CALL/EXECUTE, DDL e transações.
  Os dois erros lexicais críticos invalidam adoção direta mesmo com DML comum aceito.
- SQLite: AUTOINCREMENT, WITH externo, RETURNING de INSERT/UPDATE/DELETE, PRAGMA
  getter/setter, ATTACH/DETACH, VACUUM/ANALYZE/REINDEX e transações. node-sql-parser
  rejeita PRAGMA, VACUUM, DETACH, brackets, transações e parte de WITH/RETURNING.
- EXPLAIN estimate/analyze é exercitado separadamente; node-sql-parser aceita
  estimate MySQL do corpus, mas não os casos PostgreSQL nem estimate SQLite, e
  rejeita ANALYZE dos casos PG/MySQL. pgsql-ast-parser rejeita os EXPLAIN testados.
  Isso não altera a restrição SELECT/CTE do fluxo server-side do Checkpoint 4.
- CREATE TABLE gerado: os três casos usam exatamente identity/AUTO_INCREMENT/
  AUTOINCREMENT dos providers originais. node-sql-parser aceita os três; o outro
  aceita PostgreSQL e não é chamado para os demais.
- Schema Diff: 6 casos de migrations reais com CREATE/ALTER/DROP INDEX/DROP FK/
  CREATE INDEX e wrappers/lotes. node-sql-parser rejeita ALTER PG e SQLite;
  pgsql-ast-parser aceita migrations PG. DROP FK/drop-column recusados pelo gerador
  SQLite são comentários, não operações inventadas pelo corpus. Só o comentário
  de timestamp do gerador é normalizado para tornar fingerprint estável.
- Strings, delimitadores, comentários ordinários, mixed case, semicolon em string,
  whitespace e quoted names possuem casos negativos; não foram adicionadas regex
  de classificação como fallback. EXEC é inválido para estes três dialects no
  corpus, não um alias universal de EXECUTE. Sintaxe desconhecida é categoria própria.

### Comparação arquitetural

| Alternativa | Avaliação | Decisão |
| --- | --- | --- |
| A — utilities existentes | Leves, dialect facts centralizados, reutilizáveis para UX; sem AST/validação e com as omissões demonstradas | Manter contratos atuais; não promover a autorização |
| B — evoluir scanners | Pequenos probes podem ajudar a marcar incerteza; modelar toda gramática/CTEs/DDL/modos viraria parser próprio e aumentaria divergência upstream | Não construir gramática universal; eventual preflight só pode reduzir confiança, nunca gerar read a partir de parse failure |
| C — node-sql-parser | API simples `astify(sql,{database})`; três dialects nominais, multi-statement e DML úteis; parsing permissivo/incorreto em casos críticos | Rejeitado como dependência/core definitivo nesta fase |
| D — pgsql-ast-parser | `parse(sql)` retorna AST; alternativa relevante por suporte PG/CTE e implementação JS; só PostgreSQL, limitações de EXPLAIN/manutenção e comentário | Rejeitado como solução V1; não usar como fallback para MySQL/SQLite |

## Dependências, licença, manutenção e runtime

**package.json e bun.lock do projeto permanecem intactos.** O spike instalou
temporariamente, fora do repositório, com `--ignore-scripts --no-audit --no-fund
--no-package-lock`. Nenhum pacote foi executado por lifecycle script. A primeira
consulta npm encontrou EPERM no cache padrão; foi repetida com cache próprio na
pasta temporária, sem alterar permissões/configuração global.

| Pacote avaliado | Licença | Tamanho unpacked do registry | Arquivos JS medidos |
| --- | --- | ---: | --- |
| node-sql-parser 5.4.0 | Apache-2.0 | 92.373.153 bytes (~88 MiB, inclui builds/maps) | index.js 2.505.457 B; builds PG 308.145 B, MySQL 275.999 B, SQLite 205.904 B |
| pgsql-ast-parser 12.0.2 | MIT | 1.715.138 bytes (~1,64 MiB) | index.js 371.991 B |

Tamanho instalado não é bundle gzip nem memória RSS. Não foi feito build/browser
bundle com esses pacotes; o impacto no browser do fork é zero. Ambos rodaram em
Bun/Windows sem compilação nativa. Uma eventual adoção seria em módulos com
`import 'server-only'`, imports por dialect quando adequados, limites de tamanho/
profundidade e orçamento de parsing; nunca no barrel compartilhado do browser.

O registry consultado informa última modificação 2026-01-12 para node-sql-parser e
2026-01-27 para pgsql-ast-parser. São sinais de publicação, não SLA nem prova de
manutenção suficiente. A necessidade de acompanhar gramáticas, versões do banco,
dependências transitivas e atualizações dos pacotes permanece risco explícito.
Nenhuma licença experimental foi incorporada ao produto/distribuição.

Transitive versions efetivamente instaladas: `@types/pegjs 0.10.6`,
`big-integer 1.6.52`, `moo 0.5.3`, `nearley 2.20.1`, `commander 2.20.3`,
`railroad-diagrams 1.0.0`, `randexp 0.4.6`, `discontinuous-range 1.0.0`,
`ret 0.1.15`. Nenhuma foi adicionada ao lockfile do fork.

## Performance

Microbenchmark: Bun 1.4.0, Windows 10.0.19045 x64, Intel Core i5-10210U 1.60 GHz.
`process.version` dentro de Bun: v26.3.0; Node CLI instalado: v26.8.1. Três warmups;
200 iterações para query de 32 B, 30 para 50 statements/839 B e 5 para IN de 5.000
literais/23.925 B. São tempos wall-clock locais, não SLA, pior caso ou proteção DoS.

A medição final foi repetida sem os gates concorrentes; o JSON conserva os números
exatos e p95. Medianas aproximadas da rodada registrada:

| Parser/dialect | Curta | 50 statements | IN 5.000 |
| --- | ---: | ---: | ---: |
| node-sql-parser / PG | 0,57 ms | 5,51 ms | 184 ms |
| node-sql-parser / MySQL | 0,48 ms | 4,28 ms | 200 ms |
| node-sql-parser / SQLite | 0,52 ms | 3,47 ms | 114 ms |
| pgsql-ast-parser / PG | 0,71 ms | 18,18 ms | 2.411 ms |

A rodada intermediária sob concorrência foi mais lenta (IN PG do pgsql-ast-parser
~6,9 s). Isso desaconselha parser síncrono sem orçamento no caminho de cada request.
Import dos módulos na rodada registrada: ~611 ms e ~71 ms, respectivamente; cache/JIT/carga
do sistema influenciam fortemente. Não foi medido consumo máximo de memória nem
fuzzing profundo; uma deadline na Promise não interrompe parser síncrono.

## Reprodução e testes

Testes normais não baixam/carregam dependências experimentais. Validam o corpus,
contrato do observador e a evidência salva, **não fingem executar o parser nem
comprovar classificação de produção**. O fingerprint impede evidência stale quando
SQL/oráculo ou saída real dos geradores muda.

As regressões existentes de Schema Diff executam seus próprios fixtures em
SQLite/DuckDB em memória. O runner do corpus não executa nenhum SQL nem abre
conexão. Nenhum banco existente do usuário foi utilizado. Caracterizações de
limitações são intencionais: se o upstream corrigir uma delas, o teste exige
revisão do achado e da evidência, não restaurar o comportamento antigo.

```powershell
# Instalação isolada opcional. Nunca executar npm install na raiz do fork.
$spikeRoot = Join-Path ([IO.Path]::GetTempPath()) ('libredb-sql-spike-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $spikeRoot
npm install --prefix $spikeRoot --cache "$spikeRoot/npm-cache" --ignore-scripts --no-audit --no-fund --no-package-lock node-sql-parser@5.4.0 pgsql-ast-parser@12.0.2
bun tests/unit/safe-mode/evaluate.ts $spikeRoot
# Somente para atualizar a evidência revisada:
bun tests/unit/safe-mode/evaluate.ts $spikeRoot --record
bun test tests/unit/safe-mode
```

O runner verifica as versões dos dois candidatos e recusa versões diferentes;
não há fallback automático nem instalação escondida. As transitivas não estão
congeladas por lockfile do projeto; reprodução futura requer revisar mudanças
transitivas e não comparar timings como se fossem determinísticos. O diretório
temporário/cache não pertence ao commit.

Validações finais e resultados são registrados na seção de checkpoint abaixo.

## Recomendação para 6B.2

**Não está pronto para consumo por policy.** A próxima decisão deve aprovar uma
etapa adicional de seleção/validação de adapters, antes de enforcement real.

1. Priorizar um parser alinhado à gramática da engine para PostgreSQL (por exemplo,
   avaliar a família libpg_query separadamente, ainda não medida nem adotada aqui),
   e candidatos específicos SQLite/MySQL. Exigir que os casos de perda de comando
   passem em AST completa, não apenas keyword.
2. Definir subconjunto suportado e contexto de versão/SQL mode/encoding, tratamento
   de comentários executáveis, SQL procedural, funções e unknown-effects.
3. Ampliar corpus/differential validation contra engines descartáveis em etapa
   autorizada, fuzzing e limites de recursos. O corpus atual não prova semântica de
   triggers, cascades, views, RLS, extensões, procedures ou dynamic SQL.
4. Somente após classificação revisada, desenhar policy separada, server-side,
   sem bypass implícito de admin. Não há proposta de afrouxar as decisões PROD.

No perfil estrito futuro, qualquer operação com dialect não suportado, parse
failure, AST parcial/nó desconhecido, procedural/dynamic SQL ou efeito indireto
não resolvido precisa levar à abstenção conservadora/unknown. Também devem
permanecer fora do subconjunto reconhecido as formas não mapeadas de PRAGMA,
ATTACH/DETACH, manutenção, DDL, multi-table DML e EXPLAIN options. Isso não diz que
toda manutenção ou DDL seja intrinsecamente unknown: diz que não deve ser autorizada
sem adapter que a represente corretamente. Mesmo SELECT reconhecido não prova
ausência universal de efeitos internos da engine.

Não iniciar policy matrix, integração API, confirmation protocol, nonce/TTL/jti,
audit Safe Mode, environment server-side, ownership ou UI como consequência deste
spike. Nenhuma query passou a ser bloqueada nesta fase.

## Fontes primárias consultadas

- [node-sql-parser: projeto/API/dialects/licença](https://github.com/taozhi8833998/node-sql-parser)
- [pgsql-ast-parser: projeto/API/limitações/licença](https://github.com/oguimbal/pgsql-ast-parser)
- [Registry node-sql-parser](https://registry.npmjs.org/node-sql-parser/5.4.0)
- [Registry pgsql-ast-parser](https://registry.npmjs.org/pgsql-ast-parser/12.0.2)
- [MySQL 8.4: comentários executáveis e regra de `--`](https://dev.mysql.com/doc/refman/8.4/en/comments.html)
- [PostgreSQL: SELECT, CTEs e lista de projeção opcional](https://www.postgresql.org/docs/current/sql-select.html)
- [SQLite: WITH e limitações](https://www.sqlite.org/lang_with.html)

As conclusões de cobertura/performance vêm da execução local dos candidatos,
não do suporte nominal divulgado nos READMEs.

## Checkpoint

Gates concluídos em 2026-09-14 (lint global também executado na preparação):

| Validação | Resultado final |
| --- | --- |
| `bun run typecheck` | Passou |
| `bun run lint` | Passou, 0 errors; ESLint mantém 131 warnings existentes |
| `bun test tests/unit/safe-mode` | 237 pass, 0 fail, 3 arquivos |
| `bun test tests/unit/sql tests/unit/db/query-limiter.test.ts tests/unit/lib/create-table.test.ts tests/unit/schema-diff` | 1.179 pass, 0 fail, 19 arquivos |
| `bun test tests/unit/db/operations/statement-guard.test.ts tests/unit/lib/explain` | 334 pass, 0 fail, 14 arquivos |
| `bun test tests/components/QuerySafetyDialog.test.tsx` | 113 pass, 0 fail, 1 arquivo |
| `bun run build` | Passou; Next.js 16.3.3; 39/39 páginas geradas |
| `git diff --check` e revisão staged | Sem erros de whitespace |

Total das execuções finais: **1.863 testes em 37 arquivos**, dos quais 237 novos.
Testes existentes de Agent/EXPLAIN não foram modificados. Não foi repetida a suíte
completa agregada do Windows. O teste DuckDB `an added table declares its foreign
key inside CREATE TABLE, and the engine accepts it` excedeu 5 s na primeira
execução concorrente do grupo (8,65 s). Sem modificar código ou timeout, passou
isoladamente (~519 ms) e depois no grupo completo (1.179/1.179). Isso é uma
falha transitória de timing observada em teste existente, não um novo erro
reproduzível de classificação. Não foi feita correção de compatibilidade Windows.

Durante a montagem, os testes novos detectaram evidência stale e uma checagem
excessiva de comprimento da descrição dos casos. Foram ajustados apenas os
artefatos da fase: timestamp de comentário normalizado, evidência regenerada e
propósito validado como não vazio. Não há falha nova pendente.

Build conservou os avisos existentes sobre lockfile externo e quatro pontos de
filesystem tracing (Agent config, DuckDB, SQLite, seed config-loader). Nenhum deles
foi corrigido nesta tarefa; nenhuma regressão EBUSY/path handling foi introduzida.

Revisão de escopo: **10 arquivos novos**, todos listados acima e este documento;
nenhum arquivo anteriormente tracked foi modificado. Sem alterações em
`package.json`, `bun.lock`, `src/` ou runners globais. Commit local previsto:
`test: add safe mode sql classification corpus`, apenas estes artefatos.
Nenhum push/PR/merge/rebase/tag/release, nenhuma Fase 6B.2 iniciada.

Os dois documentos históricos permanecem intocados, untracked e fora do stage.
SHA-256 conferidos antes e depois das validações:

- `FORK_BASELINE.md`: `E77F183900AF89C741D4C783A8B414431DE9B2C0DC8A49EF9410DC95027D81ED`
- `INTERNAL_ARCHITECTURE_MAP.md`: `A3F03FC6D0D921420E18718354BE58915C9BC4FB9961A20C69FBAAF94C5EC17B`
