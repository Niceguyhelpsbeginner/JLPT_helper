const fs = require('fs');
const path = require('path');

// JSON 파일 경로와 인증서 타입 매핑
const fileMappings = [
    { file: 'jlpt/jlptN1/read.json', certification: 'JLPT N1', language: 'ja' },
    { file: 'jlpt/jlptN2/read.json', certification: 'JLPT N2', language: 'ja' },
    { file: 'toeic/reading/read.json', certification: 'TOEIC', language: 'en' },
    { file: 'topik/reading/read.json', certification: 'TOPIK', language: 'ko' }
];

// SQL 이스케이프 함수
function escapeSQL(str) {
    if (!str) return '';
    return str.replace(/'/g, "''").replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}

// JSONB 이스케이프 함수
function escapeJSONB(str) {
    if (!str) return '';
    return str.replace(/\\/g, '\\\\').replace(/'/g, "''");
}

// SQL INSERT 문 생성
function generateSQL() {
    let sqlStatements = [];
    
    fileMappings.forEach(({ file, certification, language }) => {
        try {
            const filePath = path.join(__dirname, file);
            if (!fs.existsSync(filePath)) {
                console.error(`File not found: ${file}`);
                return;
            }
            
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            
            if (!data.reading_quizes || !Array.isArray(data.reading_quizes)) {
                console.error(`Invalid format in ${file}`);
                return;
            }
            
            data.reading_quizes.forEach((passage, index) => {
                const passageBody = escapeSQL(passage.body);
                const questionsJSON = escapeJSONB(JSON.stringify(passage.questions));
                
                // difficulty 결정 (문제 수에 따라)
                let difficulty = 'medium';
                const questionCount = passage.questions ? passage.questions.length : 0;
                if (questionCount <= 2) {
                    difficulty = 'easy';
                } else if (questionCount >= 4) {
                    difficulty = 'hard';
                }
                
                const sql = `INSERT INTO reading_quizzes (certification_type, language, passage_body, questions, difficulty) VALUES ('${certification}', '${language}', '${passageBody}', '${questionsJSON}'::jsonb, '${difficulty}');`;
                sqlStatements.push(sql);
            });
            
            console.log(`Processed ${file}: ${data.reading_quizes.length} passages`);
        } catch (error) {
            console.error(`Error processing ${file}:`, error.message);
        }
    });
    
    return sqlStatements.join('\n\n');
}

// SQL 파일 생성
const sql = generateSQL();
const outputFile = path.join(__dirname, 'insert_reading_quizzes.sql');

fs.writeFileSync(outputFile, `-- 독해 문제 데이터 INSERT 문\n-- 생성일: ${new Date().toISOString()}\n\n${sql}\n`, 'utf8');

console.log(`\nSQL 파일이 생성되었습니다: ${outputFile}`);
console.log(`총 ${sql.split('INSERT INTO').length - 1}개의 INSERT 문이 생성되었습니다.`);

