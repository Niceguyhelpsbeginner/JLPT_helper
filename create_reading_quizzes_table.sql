-- 독해 문제 테이블 생성
CREATE TABLE IF NOT EXISTS reading_quizzes (
    id BIGSERIAL PRIMARY KEY,
    certification_type TEXT NOT NULL, -- 'JLPT N1', 'JLPT N2', 'TOEIC', 'TOPIK' 등
    language TEXT NOT NULL, -- 'ja', 'en', 'ko' 등
    passage_body TEXT NOT NULL, -- 지문 내용
    questions JSONB NOT NULL, -- 문제 배열 (JSON 형식)
    difficulty TEXT DEFAULT 'medium', -- 'easy', 'medium', 'hard'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_reading_quizzes_certification ON reading_quizzes(certification_type);
CREATE INDEX IF NOT EXISTS idx_reading_quizzes_language ON reading_quizzes(language);
CREATE INDEX IF NOT EXISTS idx_reading_quizzes_difficulty ON reading_quizzes(difficulty);

-- updated_at 자동 업데이트 트리거
CREATE TRIGGER update_reading_quizzes_updated_at BEFORE UPDATE ON reading_quizzes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS 정책 설정
ALTER TABLE reading_quizzes ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 읽기 가능하도록 정책 생성
DROP POLICY IF EXISTS "Anyone can read reading_quizzes" ON reading_quizzes;
CREATE POLICY "Anyone can read reading_quizzes" ON reading_quizzes FOR SELECT USING (true);

-- 마이그레이션을 위한 INSERT 정책
DROP POLICY IF EXISTS "Allow insert for reading_quizzes migration" ON reading_quizzes;
CREATE POLICY "Allow insert for reading_quizzes migration" ON reading_quizzes FOR INSERT WITH CHECK (true);

