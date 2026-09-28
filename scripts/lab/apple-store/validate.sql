-- Read-only checks. Every row must report zero violations. Explicit schema, no search_path dependency.
WITH counts AS (
  SELECT 'categorias' AS name, COUNT(*) AS actual, 7 AS expected FROM apple_store_lab.categorias
  UNION ALL SELECT 'produtos', COUNT(*), 36 FROM apple_store_lab.produtos
  UNION ALL SELECT 'estoque', COUNT(*), 36 FROM apple_store_lab.estoque
  UNION ALL SELECT 'fornecedores', COUNT(*), 6 FROM apple_store_lab.fornecedores
  UNION ALL SELECT 'clientes', COUNT(*), 2000 FROM apple_store_lab.clientes
  UNION ALL SELECT 'funcionarios', COUNT(*), 12 FROM apple_store_lab.funcionarios
  UNION ALL SELECT 'vendas', COUNT(*), 3500 FROM apple_store_lab.vendas
  UNION ALL SELECT 'itens_venda', COUNT(*), 5600 FROM apple_store_lab.itens_venda
  UNION ALL SELECT 'entradas_estoque', COUNT(*), 250 FROM apple_store_lab.entradas_estoque
  UNION ALL SELECT 'movimentacoes_estoque', COUNT(*), 5572 FROM apple_store_lab.movimentacoes_estoque
  UNION ALL SELECT 'metadata_teste', COUNT(*), 1 FROM apple_store_lab.metadata_teste
), timeline AS (
  SELECT SUM(quantidade) OVER (PARTITION BY produto_id ORDER BY data_movimentacao, id ROWS UNBOUNDED PRECEDING) AS balance
  FROM apple_store_lab.movimentacoes_estoque
)
SELECT 'counts' AS check_name, COUNT(*) AS violations FROM counts WHERE actual <> expected
UNION ALL SELECT 'orphan_products', COUNT(*) FROM apple_store_lab.produtos p LEFT JOIN apple_store_lab.categorias c ON c.id = p.categoria_id WHERE c.id IS NULL
UNION ALL SELECT 'orphan_sales', COUNT(*) FROM apple_store_lab.vendas v LEFT JOIN apple_store_lab.clientes c ON c.id = v.cliente_id LEFT JOIN apple_store_lab.funcionarios f ON f.id = v.funcionario_id WHERE c.id IS NULL OR f.id IS NULL
UNION ALL SELECT 'orphan_items', COUNT(*) FROM apple_store_lab.itens_venda i LEFT JOIN apple_store_lab.vendas v ON v.id = i.venda_id LEFT JOIN apple_store_lab.produtos p ON p.id = i.produto_id WHERE v.id IS NULL OR p.id IS NULL
UNION ALL SELECT 'orphan_entries', COUNT(*) FROM apple_store_lab.entradas_estoque e LEFT JOIN apple_store_lab.produtos p ON p.id = e.produto_id LEFT JOIN apple_store_lab.fornecedores f ON f.id = e.fornecedor_id WHERE p.id IS NULL OR f.id IS NULL
UNION ALL SELECT 'orphan_stock', COUNT(*) FROM apple_store_lab.estoque e LEFT JOIN apple_store_lab.produtos p ON p.id = e.produto_id WHERE p.id IS NULL
UNION ALL SELECT 'orphan_movements', COUNT(*) FROM apple_store_lab.movimentacoes_estoque m LEFT JOIN apple_store_lab.produtos p ON p.id = m.produto_id LEFT JOIN apple_store_lab.entradas_estoque e ON e.id = m.entrada_id LEFT JOIN apple_store_lab.itens_venda i ON i.id = m.item_venda_id WHERE p.id IS NULL OR (m.entrada_id IS NOT NULL AND e.id IS NULL) OR (m.item_venda_id IS NOT NULL AND i.id IS NULL)
UNION ALL SELECT 'duplicate_clients', COUNT(*) FROM (SELECT email FROM apple_store_lab.clientes GROUP BY email HAVING COUNT(*) > 1 UNION ALL SELECT cpf_ficticio FROM apple_store_lab.clientes GROUP BY cpf_ficticio HAVING COUNT(*) > 1) d
UNION ALL SELECT 'negative_stock', COUNT(*) FROM apple_store_lab.estoque WHERE quantidade < 0
UNION ALL SELECT 'negative_historical_stock', COUNT(*) FROM timeline WHERE balance < 0
UNION ALL SELECT 'stock_reconciliation', COUNT(*) FROM apple_store_lab.produtos p LEFT JOIN apple_store_lab.estoque e ON e.produto_id = p.id LEFT JOIN (SELECT produto_id, SUM(quantidade) AS quantity FROM apple_store_lab.movimentacoes_estoque GROUP BY produto_id) m ON m.produto_id = p.id WHERE e.quantidade IS DISTINCT FROM m.quantity OR e.id IS NULL
UNION ALL SELECT 'item_subtotals', COUNT(*) FROM apple_store_lab.itens_venda WHERE subtotal <> preco_unitario * quantidade - desconto_item OR subtotal < 0
UNION ALL SELECT 'sale_totals_and_items', COUNT(*) FROM apple_store_lab.vendas v LEFT JOIN (SELECT venda_id, SUM(subtotal) AS total, COUNT(*) AS items, COUNT(DISTINCT produto_id) AS products FROM apple_store_lab.itens_venda GROUP BY venda_id) i ON i.venda_id = v.id WHERE i.items IS NULL OR i.items NOT BETWEEN 1 AND 4 OR i.items <> i.products OR v.valor_total IS DISTINCT FROM i.total - v.desconto OR v.valor_total < 0
UNION ALL SELECT 'entry_movements', COUNT(*) FROM apple_store_lab.entradas_estoque e LEFT JOIN apple_store_lab.movimentacoes_estoque m ON m.entrada_id = e.id WHERE m.id IS NULL OR m.tipo <> 'ENTRADA' OR m.quantidade <> e.quantidade OR m.produto_id <> e.produto_id OR m.data_movimentacao <> e.data_entrada
UNION ALL SELECT 'sale_movements', COUNT(*) FROM apple_store_lab.itens_venda i JOIN apple_store_lab.vendas v ON v.id = i.venda_id LEFT JOIN apple_store_lab.movimentacoes_estoque m ON m.item_venda_id = i.id WHERE (v.status = 'CONCLUIDA' AND (m.id IS NULL OR m.tipo <> 'SAIDA' OR m.quantidade <> -i.quantidade OR m.produto_id <> i.produto_id OR m.data_movimentacao <> v.data_venda)) OR (v.status <> 'CONCLUIDA' AND m.id IS NOT NULL)
UNION ALL SELECT 'stock_view', ABS(COUNT(*) - 36) FROM apple_store_lab.produtos_com_estoque
UNION ALL SELECT 'sales_view', ABS(COUNT(*) - 3500) FROM apple_store_lab.resumo_vendas
UNION ALL SELECT 'stock_states', ABS(COUNT(*) FILTER (WHERE status_estoque = 'SEM ESTOQUE') - 9) + ABS(COUNT(*) FILTER (WHERE status_estoque = 'ESTOQUE BAIXO') - 9) + ABS(COUNT(*) FILTER (WHERE status_estoque = 'OK') - 18) FROM apple_store_lab.produtos_com_estoque
ORDER BY check_name;
