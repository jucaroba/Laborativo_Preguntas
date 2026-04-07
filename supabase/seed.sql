-- ============================================================
-- Seed: preguntas del juego
-- Ejecutar en SQL Editor de Supabase DESPUÉS de crear el juego
-- desde /admin. Reemplaza el nombre del juego si es necesario.
-- ============================================================

WITH new_game AS (
  INSERT INTO games (name, status, current_question_index, show_results)
  VALUES ('Lafayette', 'waiting', -1, false)
  RETURNING id
)
INSERT INTO questions (game_id, order_index, text, option_a, option_b, option_c, option_d, correct_answer)
SELECT
  new_game.id,
  q.order_index,
  q.text,
  q.option_a,
  q.option_b,
  q.option_c,
  q.option_d,
  q.correct_answer
FROM new_game, (VALUES
  -- Pregunta 1: correcta en B
  (0,
   'Cuál es el objetivo de Ebitda',
   '10%', '13%', '15%', '9%',
   'b'),

  -- Pregunta 2: correcta en C
  (1,
   'Cuál de estos NO es un objetivo',
   'Reducción en días de inventario', 'Todas las anteriores', 'Cumplimiento del ppto de viajes', 'Crecimiento en venta',
   'c'),

  -- Pregunta 3: correcta en D
  (2,
   'Qué significa ACS',
   'Atención, consultoría y servicios', 'Asesoría, cumplimiento y servicios', 'Asesor, consultor y SAC', 'Asesoría, consultoría y servicios',
   'd'),

  -- Pregunta 4: correcta en A
  (3,
   'Cuál es la meta de crecimiento como unidad B2Brands',
   '16%', '13%', '15%', '18%',
   'a'),

  -- Pregunta 5: correcta en C
  (4,
   'Cuáles son los segmentos prioritarios del negocio',
   'Impresor, Deportivo, Vestidos de baño y Accesorios', 'Fútbol, Vestidos de baño, Estampación digital, Accesorios', 'Deportivo, Ropa de playa, Accesorios e Impresión Digital', 'Deportivo, Ropa de playa, Impresión Digital y Estampación',
   'c'),

  -- Pregunta 6: correcta en D
  (5,
   'Cuál es la meta 2026 en facturación',
   '66,000', '70,000', '60,000', '77,000',
   'd'),

  -- Pregunta 7: correcta en B
  (6,
   'Cuál de estos es un valor agregado',
   'Laftech', 'Todas las anteriores', 'Personalización', 'Abastecimiento',
   'b')

) AS q(order_index, text, option_a, option_b, option_c, option_d, correct_answer);
