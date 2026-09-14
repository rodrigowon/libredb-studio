# Classificador SQL conservador — Fase 6B.1b

## Estado e fronteira de autoridade

Base: `6fdc2ab73f65e3c9742a16508e5e9348889a3e27`, branch `feat/dbstudio-custom`, inicialmente ahead 5.
Este checkpoint adiciona reconhecimento sintático isolado. **Safe Mode não está ativo.**
Não há integração com API, editor, Query Safety, Agent, transações ou providers, nem decisão de execução.
Não foram instaladas bibliotecas ou alterados package.json, bun.lock, configurações de deploy ou contratos existentes.

O resultado responde o que o texto contém/aparenta fazer, não se pode executar. Mesmo `classified` + `read`
não prova ausência universal de efeitos no banco: views, RLS, funções implícitas, operadores, extensões,
resolução de nomes, triggers e configuração de sessão precisam de controles de execução próprios.
Não é um validador da gramática completa nem substitui permissões/roles/read-only do banco.

## Arquitetura e arquivos

Todos os arquivos abaixo são novos; nenhum arquivo de produção preexistente foi modificado:

| Arquivo em `src/lib/safe-mode/` | Responsabilidade |
| --- | --- |
| `types.ts` | Entrada, resultado, statements, evidências e efeitos; contrato independente do spike |
| `limits.ts` | Orçamento determinístico fixo e sinal específico de excedente |
| `lex.ts` | Visão tokenizada, offsets e correções locais por dialeto |
| `classify.ts` | Reconhecedores limitados, CTE/EXPLAIN, filhos e agregação |
| `adapters/types.ts` | Descrição restrita do adapter, sem DatabaseProvider |
| `adapters/postgres.ts` | PostgreSQL e CTE modificadora |
| `adapters/mysql.ts` | MySQL, sem adotar gramática PostgreSQL como fallback |
| `adapters/sqlite.ts` | SQLite e comandos fora de seu subconjunto |

Reutiliza `resolveSqlGrammar`, `readSqlSpan` e `readSqlWord` de `src/lib/sql/`, sem alterá-los.
Não usa o operative keyword como autoridade: esse leitor não preserva os corpos das CTEs.
Não usa o primeiro SELECT como fallback após falha.

A divisão em statements deriva dos mesmos tokens do wrapper. O splitter compartilhado, sem esse wrapper,
não é uma autoridade adequada aqui: `--1` MySQL, dollar quoting fora de PostgreSQL, fechamento `]` SQLite
e CR em comentários exigem tratamento local. Duplicar a divisão com outro scanner reintroduziria duas
interpretações dos delimitadores. As rotas existentes continuam usando seu splitter original.

Não foi construída uma AST universal: existem apenas tokens com posições, pareamento limitado de parênteses,
reconhecedores não recursivos de formas simples e descida limitada em CTE, EXPLAIN e subqueries identificáveis.
Não há parser de expressões completo, de corpos procedurais ou de DDL específico de todos os engines.

## Contrato

Entrada: `classifySql({dialect, sql, originalSql?, parameters?})`.

- `sql` é o texto efetivamente classificado; o resultado o devolve intacto em `effectiveSql`.
- `originalSql` opcional é proveniência, não uma segunda consulta analisada. Sem ele, recebe exatamente `sql`.
- `parameters` é opaco, devolvido pela mesma referência; não é percorrido, clonado ou interpolado.
- A futura camada de confirmação deverá capturar um snapshot imutável de SQL + parâmetros + conexão/contexto.
  Manter uma referência recebida não é proteção contra mutação posterior por outro chamador.
- Statements e filhos têm operação, categoria, efeitos próprios/agregados, limitações, evidências e intervalo
  `[start,end)` em unidades UTF-16 do `effectiveSql`. `statement.sql` é o slice exato desse intervalo.
  Espaços/comentários externos ao intervalo continuam disponíveis no texto integral; não se normaliza o SQL.
- `scopeIsSafe` é sempre `not-proven`, inclusive quando existe WHERE.
- `certainty` distingue `recognized-subset` de `incomplete`; nunca significa autorização.

Evidências têm tipo `operation`, `possible-effect` ou `function-invocation`, subtipo e posição.
Um token solto em estrutura desconhecida é apenas indício (`possible-effect`), não prova de comando executável.
Efeitos são deduplicados/ordenados; statements e filhos preservam a ordem estrutural.

### Status

| Status | Significado |
| --- | --- |
| `classified` | Forma reconhecida por completo no pequeno subconjunto, sem limitações léxicas ou filhos incertos |
| `partial` | Operação/efeitos observáveis, mas estrutura, efeitos indiretos ou dialeto não totalmente estabelecidos |
| `unknown` | Não foi possível estabelecer a estrutura; inclui entrada vazia, ambiguidade e limite excedido |
| `unsupported` | Dialeto não implementado ou verbo explicitamente fora do adapter |
| `invalid` | Reservado pelo contrato; não emitido nesta versão, que não se apresenta como validador SQL completo |

Incompletos como SELECT sozinho, DELETE FROM, UPDATE x SET e WITH incompleto nunca obtêm certeza completa.
Até SELECT sozinho, válido como lista vazia no PostgreSQL, fica `unknown` por decisão de subconjunto do editor.
Algumas entradas inválidas e algumas válidas não suportadas são indistinguíveis: retornam partial/unknown,
sem tentar decidir validade por regex. `classified` não garante resolução de objetos/tipos nem aceitação pelo servidor.

Categorias: `read`, `write`, `schema`, `privilege`, `maintenance`, `transaction`, `control`, `indirect`, `unknown`.
Efeitos usam essas categorias e `unknown-effects`. Resultado incompleto sempre agrega `unknown-effects`.
O consumidor futuro deve examinar o **resultado integral**, não aproveitar um statement isolado do prefixo.
Uma limitação léxica global pode tornar incerto o resultado mesmo que um prefixo tenha estrutura reconhecível.

## Subconjunto explícito

### Formas comuns reconhecidas

- SELECT com lista de átomos (inteiro, literal, boolean/null ou identificador), `*`, aliases explícitos `AS`,
  um FROM simples com nome opcionalmente qualificado e WHERE simples de átomo ou igualdade de dois átomos.
  A sequência completa deve ser consumida: um sufixo desconhecido retira a certeza.
- DELETE FROM de alvo simples e UPDATE de alvo simples, atribuições de átomos, WHERE simples opcional.
- INSERT INTO com colunas opcionais e VALUES de átomos, inclusive múltiplas linhas.
- RETURNING simples no PostgreSQL/SQLite; em MySQL retira certeza.
- BEGIN, COMMIT, ROLLBACK simples; SAVEPOINT nome; RELEASE SAVEPOINT nome.
- CTEs `WITH [RECURSIVE] nome [(colunas)] AS (corpo)` limitadas. `MATERIALIZED`/`NOT MATERIALIZED`
  apenas no PostgreSQL/SQLite. SEARCH/CYCLE, listas malformadas e corpos fora do conjunto ficam incertos.
  A recursão é de reconhecimento estrutural, não uma prova de término/custo da consulta recursiva no banco.

### Por dialeto

| Área | PostgreSQL | MySQL | SQLite |
| --- | --- | --- | --- |
| DML simples acima | Recognized subset | Recognized subset sem RETURNING | Recognized subset com RETURNING simples |
| INSERT SELECT, subqueries e joins | Partial, preserva read/write e filhos | Partial; UPDATE/DELETE multi-alvo ou JOIN têm WHERE unknown | Partial; REPLACE preserva write |
| CTE de leitura simples/aninhada | Reconhecida dentro dos limites | Reconhecida dentro dos limites | Reconhecida dentro dos limites |
| CTE INSERT/UPDATE/DELETE | Preserva os filhos e write, inclusive sob SELECT externo | Partial com limitação de dialeto, sem descartar write | Partial com limitação de dialeto, sem descartar write |
| CREATE TABLE/INDEX/VIEW, ALTER TABLE, DROP TABLE/INDEX/VIEW | Partial com operação granular | Partial com operação granular | Partial com operação granular |
| DROP DATABASE, TRUNCATE | Partial com schema | Partial com schema | Explicitamente unsupported quando reconhecidos |
| GRANT/REVOKE | Partial + privilege | Partial + privilege | Unsupported |
| VACUUM/FULL, ANALYZE, REINDEX | Partial + maintenance | ANALYZE parcial; VACUUM/REINDEX unsupported | VACUUM/ANALYZE/REINDEX parciais |
| START TRANSACTION | Reconhecido como begin | Reconhecido como begin | Unsupported |
| SET/controle | Partial + control/unknown-effects | Partial + control/unknown-effects | PRAGMA/ATTACH/DETACH parciais + control/unknown-effects |
| CALL/DO/EXECUTE | Partial + indirect/unknown-effects | Partial + indirect/unknown-effects | Unsupported preservando indícios |
| EXEC | Unsupported preservando indirect | Unsupported preservando indirect | Unsupported preservando indirect |
| EXPLAIN | Estimate/analyze + opções limitadas | Estimate/analyze e FORMAT limitado | EXPLAIN e EXPLAIN QUERY PLAN estimate |

DDL permanece partial deliberadamente: reconhecer CREATE TABLE não valida tipos, constraints, defaults,
funções, triggers ou cláusulas específicas. CREATE VIEW mantém definição como filho não executado;
CREATE TABLE AS preserva possibilidade de escrita. Nenhum gerador do produto foi alterado.
Maintenance não vira read por retornar linhas. PRAGMA não ganha pureza por aparentar ser getter.

SELECT INTO no PostgreSQL preserva read/write/schema; INTO no MySQL preserva indício write sem provar alvo.
O subtipo `select-outfile` do reconhecimento MySQL ainda é amplo: não diferencia todos os usos de INTO/variáveis.
FOR/LOCK retiram certeza e sinalizam control. Casts, operadores JSON, aritmética, parâmetros, joins,
expressões avançadas e tipos dependentes do banco podem ficar partial, mesmo quando perfeitamente válidos.

Funções chamadas em expressões reconhecíveis sinalizam indirect + unknown-effects, inclusive funções comuns:
não existe uma allowlist de pureza por nome. O SELECT continua registrado como leitura direta parcial, não erro.
Funções implícitas, funções em DDL e efeitos de views/RLS não são resolvidos pelo scanner.

Dialetos não implementados (Oracle, DuckDB, MongoDB, Redis, Cassandra, ClickHouse, Trino etc.) retornam
unsupported sem tentar PostgreSQL. Isso não remove nem modifica os providers ou sua visibilidade.

## Limites de estruturas importantes

**CTE:** cada corpo é classificado antes da operação externa. DELETE/UPDATE/INSERT internos persistem no agregado.
CTEs ambíguas preservam indícios e ficam unknown/partial. Uma operação externa não reconhecida não pode
emprestar uma aresta de não execução de EXPLAIN para apagar os efeitos da CTE.

**Batch:** todos os fragmentos de código separados por `;` são examinados na ordem. Um desconhecido impede
certeza completa do conjunto. Corpos de procedures/triggers e delimitadores de clientes (`DELIMITER`, `GO`)
estão fora do subconjunto; fragmentos nesses scripts são observações parciais, não statements prontos para executar.
Nunca usar estes intervalos como novo executor ou splitter da aplicação.

**WHERE:** `true | false | "unknown"`, apenas no UPDATE/DELETE observado. Usa nível de parênteses e limite
anterior a RETURNING; WHERE de literal/comentário/subquery não vira predicado externo. JOIN/USING, alvos
complexos, fragmentos incompletos e ambiguidade léxica podem devolver unknown. Não avalia seletividade,
tautologias, cardinalidade, permissões ou segurança: WHERE true e WHERE 1=1 continuam `not-proven`.

**EXPLAIN:** o classificador não constrói SQL. Registra modo estimate/analyze/unknown e filho original.
Estimate não agrega efeitos da execução do filho; analyze os agrega. Opções ambíguas agregam os efeitos
possíveis do filho e retiram certeza. PostgreSQL reconhece ANALYZE/ANALYSE com TRUE/ON/1 e FALSE/OFF/0,
FORMAT TEXT/JSON, rejeitando certeza em duplicatas, opções vazias e formas não reconhecidas.
Funções no filho também tornam incertos efeitos de planejamento. Outras opções válidas podem ser partial.
Não há alteração no builder, estratégias, handshake ou API do Checkpoint 4.
A distinção entre planejamento e execução segue a [documentação PostgreSQL de EXPLAIN](https://www.postgresql.org/docs/current/sql-explain.html).

## Comments, literals e identifiers

- Comentários comuns e strings/identifiers quoted reconhecidos são opacos: não inventam DELETE/DROP.
- PostgreSQL: dollar quoting com/sem tag e block comments aninhados; double quotes para nomes.
- MySQL: backticks, double quotes opacos (string/nome depende de SQL mode), `#`, e `--` somente quando
  seguido de whitespace/control ASCII. `--1` permanece código. Comentário `#` vazio com LF/CRLF/CR tem regressão.
- SQLite: double quotes, backticks e bracket até o **primeiro** `]`; `--` vai até LF, não CR isolado.
- `/*!version ... */` MySQL: corpo tokenizado como **código potencial**, sem substituição do SQL.
  Efeitos encontrados são preservados, mas versão, SQL mode e combinação com a instrução externa não são provados:
  o resultado integral nunca é classified. Comentário incompleto devolve incerteza.
- Backslash dependente de modo, span ambíguo/incompleto, hint `/*+` e formas não reconhecidas retiram certeza.
  Hints não são interpretados como comandos executados, mas também não garantem ausência de efeito.
- Nenhuma utility compartilhada foi corrigida globalmente nesta fase.

As diferenças locais foram confrontadas com [MySQL Comments](https://dev.mysql.com/doc/refman/9.7/en/comments.html)
e [SQLite SQL Comment Syntax](https://www.sqlite.org/lang_comment.html). O core não consulta esses serviços em runtime.

## Orçamentos determinísticos

Inspeção prévia: `/api/db/query` e `/api/db/multi-query` leem JSON sem teto explícito de SQL nesses handlers;
editor/execução não apresentaram um cap de caracteres na busca. DataImportModal lê arquivo inteiro e gera
INSERTs em lotes de 100 linhas. Schema Diff acumula DDL sem cap de statements. Limites do Agent são de
outro fluxo (18–45 statements conforme perfil); os limites de resultado não limitam tamanho do SQL de entrada.
Não há telemetria representativa de tamanho real: os números abaixo são **orçamentos iniciais de engenharia**,
não percentis de produção nem os limites oficiais dos databases.

| Recurso | Limite | Justificativa inicial |
| --- | ---: | --- |
| SQL | 262.144 code units UTF-16 | Cerca de 10× o cenário de 24 KB, até ~512 KiB de conteúdo UTF-16; checado antes do scanner |
| Tokens | 32.768 | Limita alocação e trabalho em SQL denso; comporta ~8.180 linhas VALUES de um átomo |
| Statements de código | 256 | Mais de 5× o batch de 50; comporta migrações usuais e 25.600 linhas em lotes de 100 se outros caps permitirem |
| Profundidade | 32 | Limita parênteses e descida em CTE/EXPLAIN/subqueries sem stack recursiva arbitrária |
| Estruturas observadas | 512 | Até 2× o número máximo de statements, restringe árvore larga de subqueries/CTEs |
| Evidências | 4.096 | Em média 8 por estrutura máxima, restringe repetição adversarial de verbos/calls |

Categorias/efeitos distintos têm vocabulário finito (10); o cap de evidências limita ocorrências coletadas,
não apenas o Set final. Os contadores são compartilhados por toda a classificação, incluindo filhos.
Profundidade de block comments PostgreSQL é lida iterativamente pela utility e limitada pelo tamanho do SQL;
o cap de 32 se refere às estruturas de código reconhecidas, não a comentários inertes.

Ao exceder qualquer limite: resultado integral unknown, `limit-exceeded:<recurso>`, statements vazios,
aggregateEffects `[unknown-effects]`, SQL integral preservado. Não retorna um prefixo truncado aproveitável.
Não há deadline de relógio. Entradas grandes legítimas também podem exceder: a futura policy deverá tratar
isso explicitamente, nunca ignorar excedente nem fracionar para obter uma aprovação parcial acidental.
Parâmetros não são percorridos: o limite de payload/bindings é responsabilidade da futura fronteira de execução.

## Corpus e métricas reproduzíveis

O corpus, modelo e evidência dos parsers da 6B.1 permanecem byte a byte no checkpoint anterior.
Fingerprint: `a0d48500c9e2cd81ddce75412d1b5654443cf3797f6cb428605d1d16ae1bc15e`.
`core-expectations.ts` mantém a expectativa deste subconjunto separada do oracle histórico.
`core-corpus.test.ts` passa **todos os 221** pelo core, compara status, operações, efeitos esperados e integridade.

| Dialeto | Total | Classified | Partial | Unknown | Invalid | Unsupported | Críticos | False read | Extras em casos válidos |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| PostgreSQL | 80 | 40 | 32 | 7 | 0 | 1 | 47 | 0 | 1 |
| MySQL | 72 | 33 | 32 | 6 | 0 | 1 | 43 | 0 | 3 |
| SQLite | 68 | 32 | 27 | 7 | 0 | 2 | 42 | 0 | 2 |
| Provider não suportado | 1 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 |
| Total | 221 | 105 | 91 | 20 | 0 | 5 | 132 | 0 | 6 |

47,51% classified; 41,18% partial; 9,05% unknown; 2,26% unsupported. Invalid=0 não significa ausência de SQL
inválido no corpus: significa abstenção de uma autoridade gramatical que esta implementação não possui.
Há quatro unsupported específicos de dialeto: EXEC nos três e TRUNCATE no SQLite; mais o provider desconhecido.

Grupo crítico: efeitos write/schema/privilege/maintenance/control/indirect do oracle, mais casos inválidos
adversariais EXEC/CTE modificadora/CTE malformada/TRUNCATE. O gate usa agregado exatamente `[read]`
como falso read, mesmo sem exigir status classified. **0/132 críticos**, zero false reads globais e zero
casos válidos com efeito esperado ausente. Os nove gerados preservam operações DDL e ordem:
3 Create Table + 6 Schema Diff. Metadata com newline sanitizado não inventa DELETE; comando real posterior aparece.

Os seis falsos positivos conservadores são efeito adicional `control` por SET em:
`postgres/update-subquery-where`, `mysql/update-subquery-where`, `sqlite/update-subquery-where`,
`mysql/update-join`, `mysql/update-multiple`, `sqlite/cte-update`. Permanecem partial/possible-effect,
não promessa de comando SET independente. Não foram escondidos por remover casos difíceis.
Além disso, 16 entradas sintaticamente inválidas têm indícios de efeito, contados separadamente no artefato:
não são declarações de que esses comandos executariam. Indirect em funções comuns é uma abstenção esperada,
não uma prova de que uma função seria impura.

Reproduzir sem banco ou instalação:

```sh
bun test tests/unit/safe-mode
bun run tests/unit/safe-mode/evaluate-core.ts
# Atualização explícita somente do novo artefato, nunca da evidência histórica:
bun run tests/unit/safe-mode/evaluate-core.ts --record
```

`core-evaluation-results.json` contém as 221 observações, contadores, listas de diferenças e benchmarks.
Tem teste de fingerprint e de atualidade dos status/efeitos/operações; números de tempo não são assertions.

## Performance e regressões

Benchmark offline com Bun 1.4.0 (process.version v26.3.0), Windows 10.0.19045, Intel i5-10210U.
20 warmups por cenário/dialeto; medidas de média, sem SLA ou isolamento de CPU. Nenhum SQL de teste é executado.
O arquivo de resultados registra tempos exatos da rodada final para:

- Consulta simples: 31 bytes, 2.000 iterações.
- 50 statements: 1.650 bytes, 200 iterações.
- VALUES com 300 linhas: 24.024 bytes (~24 KB), 100 iterações.
- Literal próximo ao teto: 262.144 code units, 100 iterações.
- Próximo ao teto de tokens: VALUES com 8.180 linhas, 32.744 bytes, 30 iterações.

A previsibilidade vem dos caps e ausência de backtracking/gramática universal, não de um timeout frágil.
O cenário de literal grande é mais barato que SQL denso: não é uma demonstração de pior caso.

Médias da rodada registrada (ms):

| Cenário | PostgreSQL | MySQL | SQLite |
| --- | ---: | ---: | ---: |
| Curta | 0,0146 | 0,0141 | 0,0079 |
| 50 statements | 0,4472 | 0,6046 | 0,3137 |
| ~24 KB | 0,5844 | 0,8298 | 0,3470 |
| Teto de caracteres | 0,8988 | 1,0591 | 0,7124 |
| Próximo ao teto de tokens | 10,3904 | 9,3839 | 10,0158 |

Invariantes/testes novos: ordem, efeitos, WHERE por escopo, CTE INSERT/UPDATE/DELETE, aliases quoted,
comments adversariais MySQL, CR/LF, dollar quoting, funções, EXPLAIN false/true/ambíguo/duplicado,
unknown propagado, todos os caps, SQL/params intactos, dialeto sem fallback e metadata sanitizada.
Inclui variações determinísticas de case, whitespace, comentários, delimitadores em strings e nesting.
Uma assertion inicial foi corrigida para respeitar filhos NÃO executados de EXPLAIN estimate: evidência de
DELETE no filho não significa write no pai. O comportamento de runtime existente não foi alterado para o teste.

Validações desta fase:

| Comando/grupo | Resultado |
| --- | --- |
| `bun run typecheck` | Zero erros |
| `bun run lint` | Zero erros; 131 warnings ESLint preexistentes, além dos avisos oxlint existentes |
| `bun test tests/unit/safe-mode` | 588 pass / 0 fail (351 novos testes + 237 do spike) |
| SQL utilities + query-limiter + Create Table + Schema Diff | 1.179 pass / 0 fail |
| statement-guard + EXPLAIN | 334 pass / 0 fail |
| QuerySafetyDialog | 113 pass / 0 fail |
| Total dos grupos finais, sem contar reruns | 2.214 pass / 0 fail em 39 arquivos |
| `bun run build` | Sucesso, 39/39 páginas; compilação 41s e TypeScript 14,3s |

Não ocorreram falhas finais de EBUSY ou Windows paths nesses grupos. Permaneceram os avisos anteriores de
lockfile externo ao repositório e quatro avisos de tracing (Agent config, DuckDB, SQLite e seed loader),
sem correções oportunistas. Um erro oxlint do loop novo foi corrigido localmente antes do lint final.

## Prontidão para uma policy conservadora

**SIM, como fonte limitada de evidência sintática**, desde que unknown/partial/unsupported/invalid,
limit-exceeded e unknown-effects nunca sejam aprovação automática no perfil estrito.
Não significa "SQL seguro" nem autorização para iniciar 6B.2 neste checkpoint.

Condições obrigatórias para o desenho futuro (não implementadas aqui):

1. Consumir resultado integral e SQL efetivamente enviado, após qualquer builder, incluindo EXPLAIN;
   nunca aprovar só pelo primeiro verbo, WHERE, status ou por um prefixo/filho.
2. Vincular confirmação a SQL + parâmetros + conexão/dialeto e contexto imutáveis, sem TOCTOU.
3. Manter controles reais de banco/role/read-only/budgets e guard especializado do Agent.
4. Tratar funções, views/RLS, operadores/tipos, planejamento, triggers e recursos externos como limites
   da análise sintática. `classified/read` sozinho não é uma sandbox de execução.
5. Modelar transações, multi-statements, estados de sessão e comandos fora do subconjunto separadamente.
6. Não usar o scanner para reescrever/executar fragmentos nem considerar unsupported um motivo para
   recorrer a outro dialeto. Novos subconjuntos precisam de corpus e regressões antes de ganhar certeza.

Riscos residuais: ausência de gramática completa; falsa positividade por tokens em estruturas desconhecidas;
dependência de SQL mode/versão/contexto; grande volume legítimo pode exceder caps; baixo reconhecimento de
expressões comuns avançadas. O gate finito de zero false reads não é prova formal para todo SQL.

## Fronteira preservada

Sem mudanças em API routes, Query Safety dialog/detector, Agent guard, EXPLAIN, providers/factory/capabilities,
auth/RBAC, storage, resolução de conexões, visibility, Create Table, Schema Diff ou deploy.
Zero nova dependência; zero enforcement; zero conexão ao banco existente do usuário.
`docs/FORK_BASELINE.md` e `docs/INTERNAL_ARCHITECTURE_MAP.md` continuam intocados e fora do commit.
Não executar push, PR, merge, rebase, tag ou release. Parar após o checkpoint, sem implementar 6B.2.
