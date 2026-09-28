-- Read-only exploratory queries. Revenue excludes pending/cancelled sales.
-- Top customers (sale-level totals avoid double-counting joins).
SELECT c.id, c.nome, SUM(v.valor_total) AS faturamento
FROM apple_store_lab.clientes c JOIN apple_store_lab.vendas v ON v.cliente_id = c.id
WHERE v.status = 'CONCLUIDA' GROUP BY c.id ORDER BY faturamento DESC, c.id LIMIT 10;

-- Best-selling products.
SELECT p.id, p.nome, SUM(i.quantidade) AS unidades
FROM apple_store_lab.produtos p JOIN apple_store_lab.itens_venda i ON i.produto_id = p.id
JOIN apple_store_lab.vendas v ON v.id = i.venda_id WHERE v.status = 'CONCLUIDA'
GROUP BY p.id ORDER BY unidades DESC, p.id LIMIT 10;

-- Revenue by state and by month (explicit UTC).
SELECT c.estado, SUM(v.valor_total) AS faturamento FROM apple_store_lab.clientes c
JOIN apple_store_lab.vendas v ON v.cliente_id = c.id WHERE v.status = 'CONCLUIDA'
GROUP BY c.estado ORDER BY faturamento DESC, c.estado;
SELECT date_trunc('month', data_venda AT TIME ZONE 'UTC') AS mes, SUM(valor_total) AS faturamento
FROM apple_store_lab.vendas WHERE status = 'CONCLUIDA' GROUP BY mes ORDER BY mes;

SELECT * FROM apple_store_lab.produtos_com_estoque WHERE status_estoque = 'ESTOQUE BAIXO' ORDER BY id;
SELECT c.id, c.nome FROM apple_store_lab.clientes c WHERE NOT EXISTS (
  SELECT 1 FROM apple_store_lab.vendas v WHERE v.cliente_id = c.id AND v.status = 'CONCLUIDA'
) ORDER BY c.id;
SELECT ROUND(AVG(valor_total), 2) AS ticket_medio FROM apple_store_lab.vendas WHERE status = 'CONCLUIDA';
SELECT canal, COUNT(*) AS vendas, SUM(valor_total) AS faturamento FROM apple_store_lab.vendas
WHERE status = 'CONCLUIDA' GROUP BY canal ORDER BY canal;
SELECT status, COUNT(*) AS vendas FROM apple_store_lab.vendas GROUP BY status ORDER BY status;
SELECT * FROM apple_store_lab.produtos_com_estoque WHERE status_estoque = 'SEM ESTOQUE' ORDER BY id;

-- Plain EXPLAIN does not execute the SELECT; planner choice depends on statistics.
EXPLAIN SELECT id, data_venda, valor_total FROM apple_store_lab.vendas WHERE cliente_id = 42 ORDER BY data_venda;
