-- ============================================================
-- Laborativo Preguntas — Schema de Supabase
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- 1. Tabla de juegos
CREATE TABLE IF NOT EXISTS games (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'waiting'
                          CHECK (status IN ('waiting', 'active', 'finished')),
  current_question_index INTEGER NOT NULL DEFAULT -1,
  show_results          BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Tabla de preguntas
CREATE TABLE IF NOT EXISTS questions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id        UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  order_index    INTEGER NOT NULL DEFAULT 0,
  text           TEXT NOT NULL,
  option_a       TEXT NOT NULL,
  option_b       TEXT NOT NULL,
  option_c       TEXT NOT NULL,
  option_d       TEXT NOT NULL,
  correct_answer TEXT NOT NULL CHECK (correct_answer IN ('a', 'b', 'c', 'd')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Tabla de participantes
CREATE TABLE IF NOT EXISTS participants (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id    UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  last_name  TEXT NOT NULL,
  score      INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Tabla de respuestas
CREATE TABLE IF NOT EXISTS answers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id  UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  question_id     UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  game_id         UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  selected_option TEXT NOT NULL CHECK (selected_option IN ('a', 'b', 'c', 'd')),
  is_correct      BOOLEAN NOT NULL,
  answered_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Un participante solo puede responder cada pregunta una vez
  UNIQUE (participant_id, question_id)
);

-- ============================================================
-- Índices para performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_questions_game_id ON questions(game_id);
CREATE INDEX IF NOT EXISTS idx_participants_game_id ON participants(game_id);
CREATE INDEX IF NOT EXISTS idx_answers_game_id ON answers(game_id);
CREATE INDEX IF NOT EXISTS idx_answers_question_id ON answers(question_id);
CREATE INDEX IF NOT EXISTS idx_answers_participant_id ON answers(participant_id);

-- ============================================================
-- Row Level Security (RLS)
-- Permisivo para uso interno — ajustar si necesitas autenticación
-- ============================================================
ALTER TABLE games        ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE answers      ENABLE ROW LEVEL SECURITY;

-- Políticas: acceso público de lectura y escritura (anon key)
CREATE POLICY "public_games_select"        ON games        FOR SELECT USING (true);
CREATE POLICY "public_games_insert"        ON games        FOR INSERT WITH CHECK (true);
CREATE POLICY "public_games_update"        ON games        FOR UPDATE USING (true);
CREATE POLICY "public_games_delete"        ON games        FOR DELETE USING (true);

CREATE POLICY "public_questions_select"    ON questions    FOR SELECT USING (true);
CREATE POLICY "public_questions_insert"    ON questions    FOR INSERT WITH CHECK (true);
CREATE POLICY "public_questions_update"    ON questions    FOR UPDATE USING (true);
CREATE POLICY "public_questions_delete"    ON questions    FOR DELETE USING (true);

CREATE POLICY "public_participants_select" ON participants FOR SELECT USING (true);
CREATE POLICY "public_participants_insert" ON participants FOR INSERT WITH CHECK (true);
CREATE POLICY "public_participants_update" ON participants FOR UPDATE USING (true);
CREATE POLICY "public_participants_delete" ON participants FOR DELETE USING (true);

CREATE POLICY "public_answers_select"      ON answers      FOR SELECT USING (true);
CREATE POLICY "public_answers_insert"      ON answers      FOR INSERT WITH CHECK (true);
CREATE POLICY "public_answers_update"      ON answers      FOR UPDATE USING (true);
CREATE POLICY "public_answers_delete"      ON answers      FOR DELETE USING (true);

-- ============================================================
-- Realtime — habilitar para las 4 tablas
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE games;
ALTER PUBLICATION supabase_realtime ADD TABLE questions;
ALTER PUBLICATION supabase_realtime ADD TABLE participants;
ALTER PUBLICATION supabase_realtime ADD TABLE answers;
