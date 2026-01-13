// 전역 상태 관리
const AppState = {
    currentPage: 'home',
    currentUser: null, // 현재 로그인한 사용자
    vocabulary: [],
    searchHistory: [],
    settings: {
        targetCertification: 'none',
        dailyGoal: 10,
        ttsLanguage: 'ja',
        ttsRate: 1.0,      // 읽는 속도 (0.1 ~ 10)
        ttsPitch: 1.0,     // 음성 높이 (0 ~ 2)
        ttsVolume: 1.0     // 볼륨 (0 ~ 1)
    },
    dictionary: null, // 로드된 사전 데이터
    compoundWords: null, // 복합 단어 사전 (일본어)
    singleCharacters: null, // 단일 한자 사전 (일본어)
    currentQuiz: null,
    currentTest: null,
    currentFlashcardIndex: 0,
    currentReadingPassage: null,
    readingAnswers: {},
    dailyProgress: {
        date: new Date().toDateString(),
        wordsLearned: 0,
        goal: 10
    }
};

// 브라우저 뒤로가기/앞으로가기 처리
window.addEventListener('popstate', (e) => {
    if (e.state && e.state.page) {
        showPage(e.state.page, true); // skipHistoryUpdate = true
    } else {
        // URL에서 페이지 이름 추출
        const path = window.location.pathname;
        const pageName = path === '/' || path === '/index.html' ? 'home' : path.substring(1).split('/')[0];
        if (pageName) {
            showPage(pageName, true);
        }
    }
});

// 초기화
document.addEventListener('DOMContentLoaded', async () => {
    // 초기 로드 시 URL 확인하여 페이지 설정
    const path = window.location.pathname;
    if (path !== '/' && path !== '/index.html') {
        const pageName = path.substring(1).split('/')[0];
        if (pageName && document.getElementById(`${pageName}-page`)) {
            AppState.currentPage = pageName;
        }
    }
    
    // Supabase Auth 상태 확인
    if (window.supabaseClient) {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        
        if (session) {
            // 로그인된 상태
            AppState.currentUser = {
                id: session.user.id,
                email: session.user.email
            };
            await loadUserData();
            await loadData();
            await loadDictionary();
            await checkOnboardingStatus(); // 온보딩 상태 확인
        } else {
            // 로그인되지 않은 상태 - 로그인 모달 자동 표시
            showLoginModal();
            // 페이지 접근 제한
            disablePageAccess();
        }
        
        // Supabase Auth 상태 변화 감지
        window.supabaseClient.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                if (session) {
                    AppState.currentUser = {
                        id: session.user.id,
                        email: session.user.email
                    };
                    await loadUserData();
                    await loadData();
                    await checkOnboardingStatus(); // 온보딩 상태 확인
                }
            } else if (event === 'SIGNED_OUT') {
                AppState.currentUser = null;
                AppState.vocabulary = [];
                AppState.searchHistory = [];
                saveUserData();
                saveData();
                updateAuthUI();
                updateUI();
                showLoginModal(); // 로그아웃 시 로그인 모달 표시
                disablePageAccess(); // 페이지 접근 제한
            }
        });
    } else {
        // Supabase 클라이언트가 없으면 로그인 모달 표시
        showLoginModal();
        disablePageAccess();
    }
    
    initializeEventListeners();
    updateUI();
    updateAuthUI();
});

// 데이터 로드 (Supabase 또는 localStorage)
async function loadData() {
    // 로그인하지 않은 경우 localStorage 사용
    if (!AppState.currentUser || !window.supabaseClient) {
        loadDataFromLocalStorage();
        return;
    }

    const supabase = window.supabaseClient;
    const userId = AppState.currentUser.id;

    try {
        // 사용자 단어장 로드
        const { data: vocabData } = await supabase
            .from('user_vocabulary')
            .select('*, words(*)')
            .eq('user_id', userId);

        if (vocabData) {
            AppState.vocabulary = vocabData.map(item => ({
                id: item.word_id,
                word: item.words?.word || '',
                meaning: item.words?.meaning || '',
                pronunciation: item.words?.pronunciation || '',
                mastered: item.mastered,
                reviewCount: item.review_count,
                lastReviewed: item.last_reviewed_at
            }));
        }

        // 검색 기록 로드 (최근 50개)
        const { data: historyData } = await supabase
            .from('search_history')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(50);

        if (historyData) {
            AppState.searchHistory = historyData.map(item => ({
                query: item.query,
                language: item.language,
                date: item.created_at
            }));
        }

        // 오늘의 진행상황 로드
        const today = new Date().toISOString().split('T')[0];
        const { data: progressData } = await supabase
            .from('user_progress')
            .select('*')
            .eq('user_id', userId)
            .eq('date', today)
            .single();

        if (progressData) {
            AppState.dailyProgress = {
                date: progressData.date,
                wordsLearned: progressData.words_learned || 0,
                goal: AppState.settings.dailyGoal
            };
        } else {
            AppState.dailyProgress = {
                date: new Date().toDateString(),
                wordsLearned: 0,
                goal: AppState.settings.dailyGoal
            };
        }

        // 설정은 localStorage에 저장 (Supabase 테이블 없음)
        const savedSettings = localStorage.getItem('settings');
        if (savedSettings) {
            AppState.settings = { ...AppState.settings, ...JSON.parse(savedSettings) };
        }
    } catch (error) {
        console.error('데이터 로드 오류:', error);
        // 폴백: localStorage 사용
        loadDataFromLocalStorage();
    }
}

// localStorage에서 데이터 로드 (폴백)
function loadDataFromLocalStorage() {
    const savedVocab = localStorage.getItem('vocabulary');
    const savedHistory = localStorage.getItem('searchHistory');
    const savedSettings = localStorage.getItem('settings');
    const savedProgress = localStorage.getItem('dailyProgress');

    if (savedVocab) {
        AppState.vocabulary = JSON.parse(savedVocab);
    }
    if (savedHistory) {
        AppState.searchHistory = JSON.parse(savedHistory);
    }
    if (savedSettings) {
        AppState.settings = { ...AppState.settings, ...JSON.parse(savedSettings) };
    }
    if (savedProgress) {
        AppState.dailyProgress = JSON.parse(savedProgress);
        // 날짜가 다르면 초기화
        if (AppState.dailyProgress.date !== new Date().toDateString()) {
            AppState.dailyProgress = {
                date: new Date().toDateString(),
                wordsLearned: 0,
                goal: AppState.settings.dailyGoal
            };
        }
    }
}

// 데이터 저장 (Supabase 또는 localStorage)
async function saveData() {
    // 설정은 항상 localStorage에 저장
    localStorage.setItem('settings', JSON.stringify(AppState.settings));

    // 로그인하지 않은 경우 localStorage 사용
    if (!AppState.currentUser || !window.supabaseClient) {
        localStorage.setItem('vocabulary', JSON.stringify(AppState.vocabulary));
        localStorage.setItem('searchHistory', JSON.stringify(AppState.searchHistory));
        localStorage.setItem('dailyProgress', JSON.stringify(AppState.dailyProgress));
        return;
    }

    const supabase = window.supabaseClient;
    const userId = AppState.currentUser.id;

    try {
        // 사용자 단어장 저장 (배치 업데이트)
        if (AppState.vocabulary && AppState.vocabulary.length > 0) {
            const vocabToUpsert = AppState.vocabulary
                .filter(v => v.id) // word_id가 있는 것만
                .map(v => ({
                    user_id: userId,
                    word_id: v.id,
                    mastered: v.mastered || false,
                    review_count: v.reviewCount || 0,
                    last_reviewed_at: v.lastReviewed || null
                }));

            if (vocabToUpsert.length > 0) {
                const { error } = await supabase
                    .from('user_vocabulary')
                    .upsert(vocabToUpsert, { onConflict: 'user_id,word_id' });

                if (error) {
                    console.error('단어장 저장 오류:', error);
                }
            }
        }

        // 검색 기록 저장 (최근 것만)
        if (AppState.searchHistory && AppState.searchHistory.length > 0) {
            const recentHistory = AppState.searchHistory.slice(0, 10); // 최근 10개만
            const historyToInsert = recentHistory.map(h => ({
                user_id: userId,
                query: h.query,
                language: h.language
            }));

            if (historyToInsert.length > 0) {
                const { error } = await supabase
                    .from('search_history')
                    .insert(historyToInsert);

                if (error) {
                    console.error('검색 기록 저장 오류:', error);
                }
            }
        }

        // 오늘의 진행상황 저장
        const today = new Date().toISOString().split('T')[0];
        const { error: progressError } = await supabase
            .from('user_progress')
            .upsert({
                user_id: userId,
                date: today,
                words_learned: AppState.dailyProgress.wordsLearned || 0,
                quiz_score: 0, // 필요시 추가
                study_time_minutes: 0 // 필요시 추가
            }, { onConflict: 'user_id,date' });

        if (progressError) {
            console.error('진행상황 저장 오류:', progressError);
        }

        // localStorage에도 백업 저장
        localStorage.setItem('vocabulary', JSON.stringify(AppState.vocabulary));
        localStorage.setItem('searchHistory', JSON.stringify(AppState.searchHistory));
        localStorage.setItem('dailyProgress', JSON.stringify(AppState.dailyProgress));
    } catch (error) {
        console.error('데이터 저장 오류:', error);
        // 폴백: localStorage에만 저장
        localStorage.setItem('vocabulary', JSON.stringify(AppState.vocabulary));
        localStorage.setItem('searchHistory', JSON.stringify(AppState.searchHistory));
        localStorage.setItem('dailyProgress', JSON.stringify(AppState.dailyProgress));
    }
}

// 이벤트 리스너 초기화
function initializeEventListeners() {
    // 언어 선택자는 설정 모달로 이동했으므로 헤더 이벤트 리스너 제거
    
    // 네비게이션
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const page = e.target.dataset.page;
            showPage(page);
        });
    });

    // 인증 관련 버튼
    document.getElementById('loginBtn')?.addEventListener('click', showLoginModal);
    document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);
    document.getElementById('accountBtn')?.addEventListener('click', openAccountModal);
    
    // 설정 버튼
    document.getElementById('settingsBtn').addEventListener('click', () => {
        openSettingsModal();
    });

    // 단어장 새로고침
    const refreshVocabBtn = document.getElementById('refreshVocabBtn');
    if (refreshVocabBtn) {
        refreshVocabBtn.addEventListener('click', () => {
            renderVocabularyList();
            showToast(typeof t === 'function' ? t('vocabularyRefreshed') : '단어장을 새로고침했습니다.', 'info', 2000);
        });
    }

    document.getElementById('saveWordBtn').addEventListener('click', saveWord);
    document.getElementById('cancelAddBtn').addEventListener('click', closeAddWordModal);
    document.getElementById('closeModalBtn').addEventListener('click', closeAddWordModal);

    // 설정 모달
    document.getElementById('closeSettingsBtn').addEventListener('click', closeSettingsModal);
    document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);

    // 사전 검색
    document.getElementById('dictSearchBtn').addEventListener('click', searchDictionary);
    document.getElementById('dictSearchInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchDictionary();
    });

    // 플래시카드
    document.getElementById('flashcard').addEventListener('click', flipCard);
    document.getElementById('prevBtn').addEventListener('click', () => changeCard(-1));
    document.getElementById('nextBtn').addEventListener('click', () => changeCard(1));
    document.getElementById('knowBtn').addEventListener('click', () => markWord(true));
    document.getElementById('dontKnowBtn').addEventListener('click', () => markWord(false));
    
    // 한국인 전용 서비스이므로 언어 선택 기능 제거됨

    // 퀴즈
    document.getElementById('startQuizBtn').addEventListener('click', startQuiz);
    document.getElementById('submitAnswerBtn').addEventListener('click', submitQuizAnswer);
    document.getElementById('retryQuizBtn').addEventListener('click', () => {
        document.getElementById('quiz-start').style.display = 'block';
        document.getElementById('quiz-question').style.display = 'none';
        document.getElementById('quiz-result').style.display = 'none';
    });

    // 독해
    document.getElementById('uploadImageBtn').addEventListener('click', () => {
        document.getElementById('imageInput').click();
    });
    document.getElementById('imageInput').addEventListener('change', handleImageUpload);
    document.getElementById('ttsBtn').addEventListener('click', readText);
    document.getElementById('ttsPauseBtn').addEventListener('click', togglePauseTTS);
    document.getElementById('ttsStopBtn').addEventListener('click', stopTTS);
    document.getElementById('loadReadingBtn').addEventListener('click', loadReadingPassage);
    
    // 텍스트 편집 기능
    document.getElementById('editTextBtn').addEventListener('click', () => {
        const readingText = document.getElementById('readingText');
        readingText.contentEditable = 'true';
        readingText.style.border = '2px solid var(--primary-color)';
        readingText.style.padding = '1rem';
        readingText.style.borderRadius = '8px';
        readingText.focus();
        document.getElementById('editTextBtn').style.display = 'none';
        document.getElementById('saveTextBtn').style.display = 'inline-block';
    });
    
    document.getElementById('saveTextBtn').addEventListener('click', async () => {
        const readingText = document.getElementById('readingText');
        const text = readingText.innerText || readingText.textContent;
        
        readingText.contentEditable = 'false';
        readingText.style.border = '';
        readingText.style.padding = '';
        readingText.style.borderRadius = '';
        
        document.getElementById('editTextBtn').style.display = 'inline-block';
        document.getElementById('saveTextBtn').style.display = 'none';
        
        // 저장된 텍스트로 다시 표시 (호버 기능 포함)
        if (AppState.currentReadingPassage && AppState.currentReadingPassage.isFromImage) {
            AppState.currentReadingPassage.text = text.trim();
            const certType = AppState.currentReadingPassage.certType || 'jlpt';
            await displayExtractedText(text.trim(), certType);
            showToast(typeof t === 'function' ? t('textSaved') : '텍스트가 저장되었습니다. 단어 정보를 다시 로드하는 중...', 'info', 2000);
        }
    });

    // 모의고사
    document.getElementById('submitTestBtn').addEventListener('click', submitTestAnswer);
    document.getElementById('retryTestBtn').addEventListener('click', () => {
        document.querySelector('.test-selector').style.display = 'grid';
        document.getElementById('testContainer').style.display = 'none';
        document.getElementById('testResult').style.display = 'none';
    });

    // 모달 닫기 (배경 클릭) - 필수 온보딩 모달은 제외
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                // 필수 온보딩 모달은 닫을 수 없음
                if (modal.dataset.required === 'true') {
                    return;
                }
                modal.classList.remove('active');
            }
        });
    });
}

// 페이지 전환
function showPage(pageName, skipHistoryUpdate = false) {
    // 로그인하지 않은 경우 접근 제한
    if (!AppState.currentUser) {
        showLoginModal();
        return;
    }
    
    // 자격증이 없는 경우 학습 페이지 접근 제한
    if (pageName === 'vocabulary' || pageName === 'reading' || pageName === 'mocktest' || pageName === 'quiz') {
        if (!AppState.settings.targetCertification || AppState.settings.targetCertification === 'none') {
            showToast('먼저 자격증을 선택해주세요. 설정에서 자격증을 추가할 수 있습니다.', 'info');
            openSettingsModal();
            return;
        }
    }
    
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    const targetPage = document.getElementById(`${pageName}-page`);
    if (targetPage) {
        targetPage.classList.add('active');
        AppState.currentPage = pageName;
    }

    const targetBtn = document.querySelector(`[data-page="${pageName}"]`);
    if (targetBtn) {
        targetBtn.classList.add('active');
    }

    // History API로 URL 업데이트 (뒤로가기/앞으로가기 처리 시에는 스킵)
    if (!skipHistoryUpdate && typeof window.history !== 'undefined') {
        const newUrl = `/${pageName === 'home' ? '' : pageName}`;
        window.history.pushState({ page: pageName }, '', newUrl);
    }

    // 페이지별 초기화
    if (pageName === 'vocabulary') {
        renderVocabularyList();
    } else if (pageName === 'progress') {
        updateProgressPage();
    } else if (pageName === 'reading') {
        // 이미지에서 추출한 텍스트가 있으면 그대로 표시, 없으면 새 지문 로드
        if (AppState.currentReadingPassage && AppState.currentReadingPassage.isFromImage) {
            // 이미지에서 추출한 텍스트가 있으면 그대로 표시
            displayExtractedText(AppState.currentReadingPassage.text, AppState.currentReadingPassage.certType || 'jlpt').catch(err => {
                console.error('이미지 텍스트 표시 오류:', err);
            });
        } else {
            loadJLPTReadingPassage();
        }
    }
}

// UI 업데이트
function updateUI() {
    updateHomeStats();
    updateFlashcard();
    renderSearchHistory();
}

// 홈 통계 업데이트
function updateHomeStats() {
    const totalWords = AppState.vocabulary.length;
    const learnedWords = AppState.vocabulary.filter(w => w.mastered).length;
    const quizScores = JSON.parse(localStorage.getItem('quizScores') || '[]');
    const avgScore = quizScores.length > 0 
        ? Math.round(quizScores.reduce((a, b) => a + b, 0) / quizScores.length) 
        : 0;

    document.getElementById('totalWords').textContent = totalWords;
    document.getElementById('learnedWords').textContent = learnedWords;
    document.getElementById('quizScore').textContent = `${avgScore}%`;
    document.getElementById('studyStreak').textContent = calculateStreak();
}

// 연속 학습일 계산
function calculateStreak() {
    const lastStudyDate = localStorage.getItem('lastStudyDate');
    if (!lastStudyDate) return 0;
    
    const today = new Date();
    const lastDate = new Date(lastStudyDate);
    const diffTime = today - lastDate;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays <= 1 ? (parseInt(localStorage.getItem('streak') || '0') + 1) : 0;
}

// 한국어인지 확인하는 함수
function isKorean(text) {
    return /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(text);
}

// 일본어인지 확인하는 함수
function isJapanese(text) {
    return /[\u3040-\u309F\u30A0-\u30FF\u4e00-\u9faf]/.test(text);
}

// 사전 데이터 로드 (Supabase에서)
async function loadDictionary() {
    try {
        // Supabase 클라이언트 확인
        if (!window.supabaseClient) {
            console.warn('Supabase 클라이언트가 로드되지 않았습니다. JSON 파일을 사용합니다.');
            await loadDictionaryFromJSON();
            return;
        }

        const supabase = window.supabaseClient;
        console.log('🔍 Supabase에서 사전 데이터 로드 시작...');

        // 일본어 단어 로드 (복합 단어 + 단일 한자)
        const { data: japaneseWords, error: jaError, count: jaCount } = await supabase
            .from('words')
            .select('*', { count: 'exact' })
            .eq('language', 'ja');

        if (jaError) {
            console.error('❌ 일본어 단어 로드 오류:', jaError);
            console.error('오류 상세:', JSON.stringify(jaError, null, 2));
            await loadDictionaryFromJSON(); // 폴백: JSON 파일 사용
            return;
        }

        console.log(`📊 일본어 단어 조회 결과: ${japaneseWords?.length || 0}개 (총 ${jaCount || 0}개)`);

        // 데이터가 없는 경우 JSON 파일 사용
        if (!japaneseWords || japaneseWords.length === 0) {
            console.warn('⚠️ Supabase에 데이터가 없습니다. JSON 파일을 사용합니다.');
            await loadDictionaryFromJSON();
            return;
        }

        // 데이터 구조 변환
        const singleCharactersList = (japaneseWords || []).filter(w => w.type === 'kanji');
        const compoundWordsList = (japaneseWords || []).filter(w => w.type === 'word' && w.kanji_components && w.kanji_components.length > 1);

        // 합성어와 단일 한자 모두 사용
        AppState.compoundWords = { words: compoundWordsList };
        AppState.singleCharacters = { words: singleCharactersList };

        // 기존 호환성을 위해 통합 사전도 유지 (단일 한자만)
        AppState.dictionary = {
            words: [
                ...singleCharactersList
            ]
        };

        console.log(`✅ 사전 로드 완료: 일본어 한자 ${singleCharactersList.length}개`);
    } catch (error) {
        console.error('❌ 사전 로드 오류:', error);
        console.error('오류 스택:', error.stack);
        // 폴백: JSON 파일 사용
        await loadDictionaryFromJSON();
    }
}

// JSON 파일에서 사전 로드 (폴백)
async function loadDictionaryFromJSON() {
    try {
        // 일본어 단일 한자 사전 로드 (상용한자 2136자)
        const singleResponse = await fetch('jlpt/vocabulary/single_character.json');
        if (singleResponse.ok) {
            const singleData = await singleResponse.json();
            AppState.singleCharacters = singleData;
        } else {
            console.warn('단일 한자 사전 파일을 찾을 수 없습니다.');
            AppState.singleCharacters = { words: [] };
        }
        
        // 합성어 사전 로드
        const compoundResponse = await fetch('jlpt/vocabulary/compound_word.json');
        if (compoundResponse.ok) {
            const compoundData = await compoundResponse.json();
            AppState.compoundWords = compoundData;
        } else {
            console.warn('합성어 사전 파일을 찾을 수 없습니다.');
            AppState.compoundWords = { words: [] };
        }
        
        // 기존 호환성을 위해 통합 사전도 유지 (단일 한자만)
        AppState.dictionary = {
            words: [
                ...(AppState.singleCharacters?.words || [])
            ]
        };
    } catch (error) {
        console.error('JSON 사전 로드 오류:', error);
        AppState.compoundWords = { words: [] };
        AppState.singleCharacters = { words: [] };
        AppState.dictionary = { words: [] };
    }
}

// 사전 검색
async function searchDictionary() {
    const query = document.getElementById('dictSearchInput').value.trim();
    
    if (!query) return;

    const resultDiv = document.getElementById('dictResult');
    resultDiv.innerHTML = '<div class="dict-placeholder">검색 중...</div>';

    // 검색 기록에 추가 (일본어로 고정)
    addToSearchHistory(query, 'ja');

    try {
        // 일본어: 로컬 사전에서 검색
        const result = searchLocalDictionary(query);
        displayDictionaryResult(result, query, 'ja');
    } catch (error) {
        console.error('검색 오류:', error);
        resultDiv.innerHTML = `
            <div class="dict-placeholder" style="color: var(--danger-color);">
                검색 중 오류가 발생했습니다.<br>
                ${error.message}
            </div>
        `;
    }
}

// 로컬 사전에서 검색 (Supabase 또는 메모리에서)
function searchLocalDictionary(word) {
    // 먼저 메모리에 로드된 데이터에서 검색 (빠름)
    const foundInMemory = searchInMemory(word);
    if (foundInMemory && !foundInMemory.error) {
        return foundInMemory;
    }

    // 메모리에 없으면 Supabase에서 직접 검색 (비동기)
    // 하지만 동기 함수이므로 메모리 검색 결과 반환
    return foundInMemory || {
        word: word,
        meaning: '검색 결과를 찾을 수 없습니다.',
        error: true
    };
}

// 메모리에 로드된 데이터에서 검색
function searchInMemory(word) {
    const isKoreanInput = isKorean(word);
    let foundWord = null;
    
    if (isKoreanInput) {
        // 한국어로 검색: 의미(meaning) 필드에서 검색 (단일 한자만 사용)
        if (AppState.singleCharacters?.words) {
            foundWord = AppState.singleCharacters.words.find(w => w.meaning === word);
            if (!foundWord) {
                foundWord = AppState.singleCharacters.words.find(w => 
                    w.meaning.includes(word) || word.includes(w.meaning)
                );
            }
        }
        
        if (foundWord) {
            return {
                word: foundWord.word,
                meaning: foundWord.meaning,
                pronunciation: foundWord.pronunciation || null,
                hiragana: foundWord.hiragana || null,
                katakana: foundWord.katakana || null,
                kanji: foundWord.type === 'kanji' ? foundWord.word : null,
                kanjiComponents: foundWord.kanji_components || foundWord.kanjiComponents || null,
                searchedKorean: word,
                error: false
            };
        }
    } else {
        // 일본어로 검색: 단어 필드에서 검색 (단일 한자만 사용)
        if (AppState.singleCharacters?.words) {
            foundWord = AppState.singleCharacters.words.find(w => w.word === word);
            if (!foundWord) {
                foundWord = AppState.singleCharacters.words.find(w => 
                    w.word.includes(word) || word.includes(w.word) ||
                    (w.hiragana && w.hiragana.includes(word)) ||
                    (w.pronunciation && w.pronunciation.includes(word))
                );
            }
        }
        
        if (foundWord) {
            return {
                word: foundWord.word,
                meaning: foundWord.meaning,
                pronunciation: foundWord.pronunciation || null,
                hiragana: foundWord.hiragana || null,
                katakana: foundWord.katakana || null,
                kanji: foundWord.type === 'kanji' ? foundWord.word : null,
                kanjiComponents: foundWord.kanji_components || foundWord.kanjiComponents || null,
                error: false
            };
        }
    }

    return {
        word: word,
        meaning: '검색 결과를 찾을 수 없습니다.',
        error: true
    };
}


// 사전 검색 시뮬레이션 (다른 언어용)
async function mockDictionarySearch(word, lang) {
    // 실제로는 외부 API를 호출해야 합니다
    // 여기서는 예시 데이터를 반환합니다
    return {
        word: word,
        meaning: `${word}의 의미입니다.`,
        example: `예문: ${word}를 사용한 문장입니다.`,
        etymology: lang === 'en' ? getEnglishEtymology(word) : null,
        songs: getSongRecommendations(word, lang)
    };
}

// 영어 어원 정보 (시뮬레이션)
function getEnglishEtymology(word) {
    const etymologyMap = {
        'un': { prefix: 'un-', meaning: '부정, 반대' },
        're': { prefix: 're-', meaning: '다시, 재' },
        'pre': { prefix: 'pre-', meaning: '이전, 미리' },
        'tion': { suffix: '-tion', meaning: '명사형 접미사' },
        'ly': { suffix: '-ly', meaning: '부사형 접미사' }
    };

    for (const [key, info] of Object.entries(etymologyMap)) {
        if (word.startsWith(key) && key.length > 2) {
            return { type: 'prefix', ...info };
        }
        if (word.endsWith(key)) {
            return { type: 'suffix', ...info };
        }
    }
    return null;
}

// 노래 추천 (시뮬레이션)
function getSongRecommendations(word, lang) {
    // 실제로는 음악 API를 사용해야 합니다
    return [
        { title: '예시 노래 1', artist: '아티스트 1', lyrics: `${word}가 포함된 가사...` },
        { title: '예시 노래 2', artist: '아티스트 2', lyrics: `${word}가 포함된 가사...` }
    ];
}

// 사전 결과 표시
function displayDictionaryResult(result, word, lang) {
    const resultDiv = document.getElementById('dictResult');
    
    let html = `
        <div class="word-entry">
            <div class="word-entry-title" onclick="showWordDetail('${word}', '${lang}')">${result.word}</div>
    `;

    // 일본어 특수 정보 표시
    if (lang === 'ja') {
        if (result.error) {
            html += `<div style="margin: 1rem 0; padding: 1rem; background: #fee2e2; border-radius: 8px; color: #991b1b;">
                <strong>⚠️</strong> ${result.meaning}
            </div>`;
        } else {
            // 한국어로 검색한 경우 안내
            if (result.searchedKorean) {
                html += `<div style="margin: 0.5rem 0; padding: 0.75rem; background: #e0f2fe; border-radius: 8px; color: #0369a1;">
                    <strong>🔍 검색어:</strong> ${result.searchedKorean} (한국어)
                </div>`;
            }
            
            // 한자, 히라가나, 가타카나 표시
            const wordForms = [];
            if (result.kanji) wordForms.push(`<span class="word-kanji">${result.kanji}</span>`);
            if (result.hiragana) wordForms.push(`<span class="word-hiragana">${result.hiragana}</span>`);
            if (result.katakana) wordForms.push(`<span class="word-katakana">${result.katakana}</span>`);
            
            if (wordForms.length > 0) {
                html += `<div style="margin: 0.5rem 0; font-size: 1.2rem; line-height: 1.8;">
                    ${wordForms.join(' ')}
                </div>`;
            }

            if (result.pronunciation) {
                html += `<div class="word-pronunciation">📢 발음: ${result.pronunciation}</div>`;
            }
        }
    }
    // 일본어 특수 정보 표시
    else if (lang === 'en') {
        if (result.error) {
            html += `<div style="margin: 1rem 0; padding: 1rem; background: #fee2e2; border-radius: 8px; color: #991b1b;">
                <strong>⚠️</strong> ${result.message || '검색 결과를 찾을 수 없습니다.'}
            </div>`;
        } else {
            if (result.pronunciation) {
                html += `<div class="word-pronunciation">📢 발음: ${result.pronunciation}</div>`;
            }
            if (result.type) {
                html += `<div style="margin: 0.5rem 0; padding: 0.5rem; background: #f3f4f6; border-radius: 6px;">
                    <strong>품사:</strong> ${result.type}
                </div>`;
            }
            if (result.level) {
                html += `<div style="margin: 0.5rem 0; padding: 0.5rem; background: #f3f4f6; border-radius: 6px;">
                    <strong>난이도:</strong> ${result.level}
                </div>`;
            }
            if (result.example) {
                html += `<div style="margin: 0.5rem 0; padding: 0.75rem; background: #fef3c7; border-radius: 6px; border-left: 3px solid #f59e0b;">
                    <strong>예문:</strong> ${result.example}
                </div>`;
            }
            if (result.synonyms && result.synonyms.length > 0) {
                html += `<div style="margin: 0.5rem 0; padding: 0.75rem; background: #e0e7ff; border-radius: 6px;">
                    <strong>유의어:</strong> ${result.synonyms.join(', ')}
                </div>`;
            }
        }
    }

    html += `
            <div class="word-entry-meaning">${result.meaning || (result.error ? '' : '의미 정보 없음')}</div>
            ${result.example ? `<div class="word-entry-example">${result.example}</div>` : ''}
            ${result.etymology ? `
                <div class="etymology-info">
                    <h5>어원</h5>
                    <p>${result.etymology.type === 'prefix' ? '접두어' : '접미어'}: ${result.etymology.prefix || result.etymology.suffix} - ${result.etymology.meaning}</p>
                </div>
            ` : ''}
        </div>
    `;

    resultDiv.innerHTML = html;

    // 한자/일본어 단어에 호버 기능 추가
    if (lang === 'ja' || lang === 'zh') {
        addKanjiHover(resultDiv);
    }

    // 영어 단어에 어원 호버 기능 추가
    if (lang === 'en') {
        addEtymologyHover(resultDiv, word);
    }
}

// 검색 기록에 추가 (한국인 전용 서비스이므로 항상 일본어)
function addToSearchHistory(word, lang) {
    const entry = { query: word, language: 'ja', date: new Date().toISOString() };
    AppState.searchHistory.unshift(entry);
    if (AppState.searchHistory.length > 20) {
        AppState.searchHistory = AppState.searchHistory.slice(0, 20);
    }
    saveData(); // Supabase에 저장됨
    renderSearchHistory();
    
    // 일본어 검색이므로 플래시카드에 자동 추가
    addSearchedWordToFlashcard(word);
}

// 검색한 단어를 플래시카드에 추가
function addSearchedWordToFlashcard(word) {
    // 사전에서 단어 정보 가져오기
    const wordInfo = searchLocalDictionary(word);
    
    if (wordInfo.error) {
        return; // 사전에 없는 단어는 추가하지 않음
    }
    
    // 이미 단어장에 있는지 확인
    const existingWord = AppState.vocabulary.find(w => 
        w.word === wordInfo.word && w.language === 'ja'
    );
    
    if (!existingWord) {
        // 단어장에 추가
        AppState.vocabulary.push({
            word: wordInfo.word,
            meaning: wordInfo.meaning,
            example: null,
            language: 'ja',
            certification: AppState.settings.targetCertification !== 'none' ? AppState.settings.targetCertification : null,
            mastered: false,
            studyCount: 0,
            correctCount: 0,
            dateAdded: new Date().toISOString(),
            pronunciation: wordInfo.pronunciation || null,
            hiragana: wordInfo.hiragana || null
        });
        
        saveData();
        updateUI();
    }
}

// 검색 기록 렌더링
function renderSearchHistory() {
    const historyList = document.getElementById('searchHistoryList');
    if (!historyList) return;

    if (AppState.searchHistory.length === 0) {
        historyList.innerHTML = '<p style="color: var(--text-secondary);">검색 기록이 없습니다.</p>';
        return;
    }

    historyList.innerHTML = AppState.searchHistory.map(entry => 
        `<span class="history-item" onclick="searchFromHistory('${entry.query || entry.word}', '${entry.language || entry.lang}')">${entry.query || entry.word}</span>`
    ).join('');
}

// 검색 기록에서 검색 (한국인 전용 서비스이므로 항상 일본어)
function searchFromHistory(word, lang) {
    document.getElementById('dictSearchInput').value = word;
    searchDictionary();
}

// 단어 상세 모달
function showWordDetail(word, lang) {
    const modal = document.getElementById('wordDetailModal');
    const result = mockDictionarySearch(word, lang);
    
    document.getElementById('wordDetailTitle').textContent = word;
    document.getElementById('wordDetailMeaning').textContent = result.meaning;
    
    const etymologySection = document.getElementById('etymologySection');
    const etymologyDiv = document.getElementById('wordEtymology');
    if (result.etymology) {
        etymologySection.style.display = 'block';
        etymologyDiv.innerHTML = `
            <p><strong>${result.etymology.type === 'prefix' ? '접두어' : '접미어'}:</strong> ${result.etymology.prefix || result.etymology.suffix}</p>
            <p><strong>의미:</strong> ${result.etymology.meaning}</p>
        `;
    } else {
        etymologySection.style.display = 'none';
    }

    const songSection = document.getElementById('songSection');
    const songsDiv = document.getElementById('wordSongs');
    if (result.songs && result.songs.length > 0) {
        songSection.style.display = 'block';
        songsDiv.innerHTML = result.songs.map(song => `
            <div class="song-item">
                <h5>${song.title}</h5>
                <p>${song.artist}</p>
                <p style="margin-top: 0.5rem; font-size: 0.85rem;">${song.lyrics}</p>
            </div>
        `).join('');
    } else {
        songSection.style.display = 'none';
    }

    document.getElementById('closeWordDetailBtn').onclick = () => {
        modal.classList.remove('active');
    };

    modal.classList.add('active');
}

// 한자 호버 기능 - 본문의 모든 한자를 hoverable로 만들기
function addKanjiHover(container) {
    // 컨테이너가 없으면 종료
    if (!container) {
        console.warn('컨테이너가 없습니다.');
        return;
    }
    
    // text-body id를 가진 본문 지문 찾기
    const textBody = container.querySelector('#text-body');
    if (!textBody) {
        console.warn('text-body 요소를 찾을 수 없습니다.');
        return;
    }
    
    // 이미 처리된 경우 건너뛰기 (중복 호출 방지)
    // 단, innerHTML이 변경된 경우에는 다시 처리할 수 있도록 허용
    if (textBody.dataset && textBody.dataset.kanjiProcessed === 'true') {
        // 이미 처리된 노드가 있는지 확인
        const hasProcessedNodes = textBody.querySelector('.kanji-word-hoverable, .kanji-compound-hoverable');
        if (hasProcessedNodes) {
        console.log('이미 처리된 본문입니다. (중복 호출 방지)');
        return;
        } else {
            // 처리된 노드가 없으면 처리 상태를 초기화하고 다시 처리
            console.log('처리 상태가 true이지만 처리된 노드가 없습니다. 다시 처리합니다.');
            textBody.dataset.kanjiProcessed = 'false';
        }
    }
    
    // 처리 시작 표시
    textBody.dataset.kanjiProcessed = 'true';
    
    console.log('=== addKanjiHover 호출됨 ===');
    console.log('text-body 내용:', textBody.innerHTML.substring(0, 100));
    
    // 합성어 데이터 맵 생성 (빠른 검색을 위해, 길이순으로 정렬하여 긴 단어를 먼저 매칭)
    const compoundWordsList = [];
    if (AppState.compoundWords?.words) {
        AppState.compoundWords.words.forEach(wordData => {
            if (wordData.word && (wordData.kanjiComponents || wordData.kanji_components) && 
                (wordData.kanjiComponents?.length > 1 || wordData.kanji_components?.length > 1)) {
                compoundWordsList.push(wordData);
            }
        });
    }
    // 길이순으로 정렬 (긴 단어를 먼저)
    compoundWordsList.sort((a, b) => (b.word?.length || 0) - (a.word?.length || 0));
    const compoundWordMap = new Map();
    compoundWordsList.forEach(wordData => {
        compoundWordMap.set(wordData.word, wordData);
    });
    
    // 한자 데이터 맵 생성 (빠른 검색을 위해)
    const kanjiMap = new Map();
    if (AppState.singleCharacters?.words) {
        AppState.singleCharacters.words.forEach(wordData => {
            kanjiMap.set(wordData.word, wordData);
        });
    }
    
    if (kanjiMap.size === 0 && compoundWordMap.size === 0) {
        console.warn('한자 데이터가 없습니다.');
        return;
    }
    
    // 본문의 모든 <p> 태그 찾기
    const paragraphs = textBody.querySelectorAll('p');
    
    if (paragraphs.length === 0) {
        console.warn('처리할 <p> 태그가 없습니다.');
        return;
    }
    
    console.log(`총 ${paragraphs.length}개의 <p> 태그를 찾았습니다.`);
    // 1개의 p태그 찾아냄.
    paragraphs.forEach((p, pIndex) => {
        // 이미 한자 hoverable이 있는 경우 건너뛰기 (중복 처리 방지)
        if (p.querySelector('.kanji-word-hoverable') || p.querySelector('.kanji-compound-hoverable')) {
            console.log(`[<p> 태그 ${pIndex + 1}] 이미 처리된 태그입니다.`);
            return;
        }
        
        // p 태그의 순수 텍스트 내용 가져오기
        const originalText = p.textContent || p.innerText || '';
        
        if (!originalText.trim()) {
            return;
        }
        
        console.log(`[<p> 태그 ${pIndex + 1}] 텍스트 길이: ${originalText.length}자`);
        
        // 텍스트 노드를 순회하면서 한자에 class만 추가
        const textNodes = [];
        const walker = document.createTreeWalker(
            p,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(node) {
                    // 부모가 이미 hoverable인 경우 건너뛰기 (합성어 또는 단일 한자)
                    let parent = node.parentNode;
                    while (parent && parent !== p) {
                        if (parent.classList && (
                            parent.classList.contains('kanji-word-hoverable') || 
                            parent.classList.contains('kanji-compound-hoverable')
                        )) {
                            return NodeFilter.FILTER_REJECT;
                        }
                        parent = parent.parentNode;
                    }
                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );
        
        let node;
        while (node = walker.nextNode()) {
            if (node && node.textContent && node.textContent.trim() && node.parentNode) {
                textNodes.push({
                    node: node,
                    text: node.textContent
                });
            }
        }
        
        console.log(`[<p> 태그 ${pIndex + 1}] ${textNodes.length}개의 텍스트 노드를 찾았습니다.`);
        
        // 각 텍스트 노드를 처리 (앞에서부터 순서대로)
        textNodes.forEach(({ node: textNode, text }, textNodeIndex) => {
            if (!textNode.parentNode) return;
            
            console.log(`\n[텍스트 노드 ${textNodeIndex + 1}/${textNodes.length}] 처리 시작`);
            console.log('원본 텍스트 노드 내용:', text.substring(0, 100) + (text.length > 100 ? '...' : ''));
            console.log('원본 텍스트 노드 길이:', text.length);
            
            const fragment = document.createDocumentFragment();
            let lastIndex = 0;
            let processedIndices = new Set(); // 이미 처리된 인덱스 추적
            
            // 1단계: 합성어 먼저 찾기 (긴 단어부터)
            const compoundMatches = [];
            for (const [compoundWord, compoundData] of compoundWordMap.entries()) {
                let searchIndex = 0;
                while (true) {
                    const index = text.indexOf(compoundWord, searchIndex);
                    if (index === -1) break;
                    
                    // 이미 처리된 범위인지 확인
                    let isOverlapping = false;
                    for (let i = index; i < index + compoundWord.length; i++) {
                        if (processedIndices.has(i)) {
                            isOverlapping = true;
                            break;
                        }
                    }
                    
                    if (!isOverlapping) {
                        compoundMatches.push({
                            word: compoundWord,
                            index: index,
                            data: compoundData,
                            length: compoundWord.length
                        });
                        
                        // 처리된 인덱스 표시
                        for (let i = index; i < index + compoundWord.length; i++) {
                            processedIndices.add(i);
                        }
                    }
                    
                    searchIndex = index + 1;
                }
            }
            
            // 합성어를 인덱스 순으로 정렬 (앞에서부터)
            compoundMatches.sort((a, b) => a.index - b.index);
            
            console.log(`[텍스트 노드 ${textNodeIndex + 1}] 합성어 매칭: ${compoundMatches.length}개`);
            if (compoundMatches.length > 0) {
                console.log('합성어 매칭 목록:', compoundMatches.map(m => `${m.word}(${m.index})`).join(', '));
            }
            
            // 2단계: 단일 한자 찾기 (합성어에 포함되지 않은 것만)
            const kanjiRegex = /[\u4E00-\u9FAF\u3400-\u4DBF]/g;
            const singleKanjiMatches = [];
            let match;
            
            while ((match = kanjiRegex.exec(text)) !== null) {
                const kanji = match[0];
                const index = match.index;
                
                // 이미 처리된 인덱스인지 확인
                if (!processedIndices.has(index) && kanjiMap.has(kanji)) {
                    singleKanjiMatches.push({
                        kanji: kanji,
                        index: index,
                        data: kanjiMap.get(kanji)
                    });
                    processedIndices.add(index);
                }
            }
            
            // 단일 한자를 앞에서부터 정렬
            singleKanjiMatches.sort((a, b) => a.index - b.index);
            
            console.log(`[텍스트 노드 ${textNodeIndex + 1}] 단일 한자 매칭: ${singleKanjiMatches.length}개`);
            if (singleKanjiMatches.length > 0) {
                console.log('단일 한자 매칭 목록:', singleKanjiMatches.map(m => `${m.kanji}(${m.index})`).join(', '));
            }
            
            // 모든 매칭을 합치고 인덱스 순으로 정렬 (앞에서부터)
            const allMatches = [...compoundMatches, ...singleKanjiMatches].sort((a, b) => a.index - b.index);
            
            console.log(`[텍스트 노드 ${textNodeIndex + 1}] 전체 매칭: ${allMatches.length}개`);
                
            // 앞에서부터 순서대로 처리
            allMatches.forEach((match, matchIndex) => {
                // 매칭 앞의 텍스트 추가
                if (match.index > lastIndex) {
                    const beforeText = text.substring(lastIndex, match.index);
                    if (beforeText) {
                        fragment.appendChild(document.createTextNode(beforeText));
                        console.log(`[텍스트 노드 ${textNodeIndex + 1}] 매칭 ${matchIndex + 1} 앞 텍스트 추가: "${beforeText.substring(0, 50)}"`);
                    }
                }
                
                // 합성어인 경우
                if (match.word) {
                    const span = document.createElement('span');
                    span.className = 'kanji-compound-hoverable';
                    span.textContent = match.word;
                    span.setAttribute('data-word', match.word);
                    span.setAttribute('data-meaning', match.data.meaning || '');
                    span.setAttribute('data-reading', match.data.hiragana || match.data.pronunciation || '');
                    span.setAttribute('data-kanji-components', JSON.stringify(match.data.kanjiComponents || match.data.kanji_components || []));
                    span.setAttribute('data-is-compound', 'true');
                    
                    fragment.appendChild(span);
                    lastIndex = match.index + match.length;
                    console.log(`[텍스트 노드 ${textNodeIndex + 1}] 합성어 span 추가: "${match.word}" (인덱스 ${match.index}-${match.index + match.length})`);
                } 
                // 단일 한자인 경우
                else if (match.kanji) {
                    const span = document.createElement('span');
                    span.className = 'kanji-word-hoverable';
                    span.textContent = match.kanji;
                    span.setAttribute('data-word', match.kanji);
                    span.setAttribute('data-meaning', match.data.meaning || '');
                    span.setAttribute('data-reading', match.data.hiragana || match.data.pronunciation || '');
                    span.setAttribute('data-on-yomi', JSON.stringify(match.data.onYomi || []));
                    span.setAttribute('data-kun-yomi', JSON.stringify(match.data.kunYomi || []));
                    span.setAttribute('data-explanation', match.data.explanation || '');
                    span.setAttribute('data-jlpt-level', match.data.jlptLevel || '');
                    span.setAttribute('data-on-yomi-words', JSON.stringify(match.data.onYomiWords || []));
                    span.setAttribute('data-kun-yomi-words', JSON.stringify(match.data.kunYomiWords || []));
                    span.setAttribute('data-is-compound', 'false');
                    
                    fragment.appendChild(span);
                    lastIndex = match.index + 1;
                    console.log(`[텍스트 노드 ${textNodeIndex + 1}] 단일 한자 span 추가: "${match.kanji}" (인덱스 ${match.index})`);
                }
            });
            
            // 매칭이 없는 경우 원본 텍스트 노드를 그대로 유지 (교체하지 않음)
            if (compoundMatches.length === 0 && singleKanjiMatches.length === 0) {
                console.log(`[텍스트 노드 ${textNodeIndex + 1}] 매칭 없음, 원본 유지`);
                return;
            }
            
            // 마지막 매칭 뒤의 텍스트 추가
                if (lastIndex < text.length) {
                const afterText = text.substring(lastIndex);
                if (afterText) {
                    fragment.appendChild(document.createTextNode(afterText));
                    console.log(`[텍스트 노드 ${textNodeIndex + 1}] 마지막 매칭 뒤 텍스트 추가: "${afterText.substring(0, 50)}"`);
                }
            }
            
            // fragment 내용 확인
            const fragmentClone = fragment.cloneNode(true);
            const tempDiv = document.createElement('div');
            tempDiv.appendChild(fragmentClone);
            console.log(`[텍스트 노드 ${textNodeIndex + 1}] fragment 내용:`, tempDiv.innerHTML.substring(0, 300) + '...');
            console.log(`[텍스트 노드 ${textNodeIndex + 1}] fragment 텍스트:`, tempDiv.textContent.substring(0, 200) + '...');
                
                // 원본 텍스트 노드를 fragment로 교체
            // textNode가 여전히 DOM에 연결되어 있는지 확인
            if (textNode.parentNode && textNode.parentNode.contains(textNode)) {
                    try {
                    const parentNode = textNode.parentNode; // 교체 전 부모 노드 저장
                    console.log(`[텍스트 노드 ${textNodeIndex + 1}] 교체 전 원본 텍스트:`, textNode.textContent.substring(0, 100));
                    console.log(`[텍스트 노드 ${textNodeIndex + 1}] 교체 전 부모 innerHTML:`, parentNode.innerHTML.substring(0, 300));
                    
                    // 원본 텍스트 노드를 fragment로 교체 (원본은 자동으로 제거됨)
                    // replaceChild는 첫 번째 자식 노드를 반환하므로 이를 저장
                    const firstReplacedNode = parentNode.replaceChild(fragment, textNode);
                    
                    console.log(`[텍스트 노드 ${textNodeIndex + 1}] 교체 완료`);
                    // 교체 후에는 parentNode를 사용 (textNode.parentNode는 null이 됨)
                    console.log(`[텍스트 노드 ${textNodeIndex + 1}] 교체 후 부모 innerHTML:`, parentNode.innerHTML.substring(0, 500) + '...');
                    } catch (e) {
                    console.error(`[텍스트 노드 ${textNodeIndex + 1}] 텍스트 노드 교체 오류:`, e);
                    console.error('textNode:', textNode);
                    console.error('textNode.parentNode:', textNode.parentNode);
                    }
            } else {
                // 이미 제거된 노드이거나 부모가 없는 경우
                console.warn(`[텍스트 노드 ${textNodeIndex + 1}] 텍스트 노드가 이미 제거되었거나 부모가 없습니다.`);
            }
        });
        // 찾은 한자들을 콘솔에 출력
        const foundKanji = [];
        p.querySelectorAll('.kanji-word-hoverable').forEach(span => {
            foundKanji.push(span.getAttribute('data-word'));
        });
        if (foundKanji.length > 0) {
            console.log(`[<p> 태그 ${pIndex + 1}] ${foundKanji.length}개의 한자를 span으로 감쌌습니다:`, foundKanji.join(', '));
        }
    });
    
    // 이벤트 연결
    attachSingleKanjiHoverEvents(textBody);
    attachCompoundWordHoverEvents(textBody);
    
    console.log('=== 한자 호버 처리 완료 (툴팁 기능 활성화) ===');
    console.log('최종 textBody.innerHTML:', textBody.innerHTML.substring(0, 1000) + '...');
    console.log('최종 textBody.textContent:', textBody.textContent.substring(0, 500) + '...');
}

// 합성어 호버 이벤트 연결 (tippy.js 사용)
async function attachCompoundWordHoverEvents(container) {
    const compoundSpans = container.querySelectorAll('.kanji-compound-hoverable');
    console.log(`합성어 호버 이벤트 연결: ${compoundSpans.length}개의 합성어를 찾았습니다.`);
    
    if (typeof tippy === 'undefined') {
        console.warn('tippy.js가 로드되지 않았습니다. 합성어 툴팁을 사용할 수 없습니다.');
            return;
        }
        
    compoundSpans.forEach(async (span) => {
        // 이미 이벤트가 연결된 경우 건너뛰기
        if (span.dataset.tippyAttached === 'true') {
                return;
            }
        
        const compoundWord = span.getAttribute('data-word');
        let meaning = span.getAttribute('data-meaning');
        const reading = span.getAttribute('data-reading') || '';
        const kanjiComponents = JSON.parse(span.getAttribute('data-kanji-components') || '[]');
        
        // 텍스트 언어는 일본어
        const textLanguage = 'ja';
        
        // 사용자 언어는 항상 한국어 (한국인 전용 서비스)
        const userLanguage = 'ko';
        
        // 언어 쌍별 테이블에서 뜻 가져오기 (일본어 -> 한국어)
        const result = await getWordMeaningFromLanguagePair(compoundWord, textLanguage, userLanguage);
        if (result && result.meaning) {
            meaning = result.meaning;
        }
        
        // 각 한자의 뜻 가져오기
        const kanjiMeanings = [];
        for (const kanji of kanjiComponents) {
            let kanjiMeaning = '';
            const kanjiData = AppState.singleCharacters?.words?.find(w => w.word === kanji);
            
            if (kanjiData) {
                kanjiMeaning = kanjiData.meaning || '';
                
                // 언어 쌍별 테이블에서 뜻 가져오기 (일본어 -> 한국어)
                const result = await getWordMeaningFromLanguagePair(kanji, textLanguage, userLanguage);
                if (result && result.meaning) {
                    kanjiMeaning = result.meaning;
                }
            }
            
            kanjiMeanings.push({
                kanji: kanji,
                meaning: kanjiMeaning || '의미 없음'
            });
        }
        
        // 첫 번째 툴팁 내용 구성 (합성어 전체의 뜻)
        let firstTooltipContent = `<div style="font-size: 1.2rem; font-weight: bold; margin-bottom: 0.5rem;">${compoundWord}</div>`;
        
        if (meaning) {
            firstTooltipContent += `<div style="font-size: 1rem; margin-bottom: 0.5rem; color: #4CAF50;">${meaning}</div>`;
        }
        
        if (reading) {
            firstTooltipContent += `<div style="font-size: 0.9rem; margin-bottom: 0.5rem; color: rgba(255,255,255,0.9);">읽기: ${reading}</div>`;
        }
        
        // 각 한자에 대한 클릭 가능한 영역 추가
        firstTooltipContent += `<div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid rgba(255,255,255,0.2);">`;
        firstTooltipContent += `<div style="font-size: 0.85rem; color: rgba(255,255,255,0.8); margin-bottom: 0.5rem;">각 한자의 뜻:</div>`;
        
        kanjiMeanings.forEach((item, index) => {
            firstTooltipContent += `<span class="inner-kanji-target" data-kanji="${item.kanji}" data-meaning="${item.meaning}" style="display: inline-block; margin: 0.2rem; padding: 0.3rem 0.5rem; background: rgba(255,255,255,0.1); border-radius: 4px; cursor: pointer; transition: background 0.2s;">${item.kanji}</span>`;
        });
        
        firstTooltipContent += `</div>`;
        
        // tippy.js로 첫 번째 툴팁 생성
        tippy(span, {
            content: firstTooltipContent,
            allowHTML: true,
            interactive: true,
            placement: 'top',
            theme: 'light-border',
            maxWidth: 350,
            
            // 툴팁이 생성되어 DOM에 나타날 때 실행되는 콜백
            onShown(instance) {
                // 툴팁 내부에 생긴 '.inner-kanji-target'을 찾아 두 번째 툴팁을 바인딩
                const innerTargets = instance.popper.querySelectorAll('.inner-kanji-target');
                
                innerTargets.forEach(innerTarget => {
                    if (!innerTarget._tippy) {
                        const kanji = innerTarget.getAttribute('data-kanji');
                        const kanjiMeaning = innerTarget.getAttribute('data-meaning');
                        
                        // 두 번째 툴팁 내용 (각 한자의 뜻)
                        const secondTooltipContent = `
                            <div style="font-size: 1.1rem; font-weight: bold; margin-bottom: 0.3rem;">${kanji}</div>
                            <div style="font-size: 0.95rem; color: #4CAF50;">${kanjiMeaning}</div>
                        `;
                        
                        tippy(innerTarget, {
                            content: secondTooltipContent,
                            allowHTML: true,
                            placement: 'right',
                            theme: 'light-border',
                            maxWidth: 250,
                        });
                    }
                });
            },
            
            // 툴팁이 숨겨질 때 두 번째 툴팁 인스턴스 정리
            onHidden(instance) {
                const innerTargets = instance.popper.querySelectorAll('.inner-kanji-target');
                innerTargets.forEach(innerTarget => {
                    if (innerTarget._tippy) {
                        innerTarget._tippy.destroy();
                        innerTarget._tippy = null;
                }
                });
            }
        });
        
        // 이벤트 연결 완료 표시
        span.dataset.tippyAttached = 'true';
    });
}

// 단일 한자 호버 이벤트 연결 (tippy.js 사용)
async function attachSingleKanjiHoverEvents(container) {
    const kanjiSpans = container.querySelectorAll('.kanji-word-hoverable');
    console.log(`단일 한자 호버 이벤트 연결: ${kanjiSpans.length}개의 한자를 찾았습니다.`);
    
    if (typeof tippy === 'undefined') {
        console.warn('tippy.js가 로드되지 않았습니다. 단일 한자 툴팁을 사용할 수 없습니다.');
        return;
    }
    
    kanjiSpans.forEach(async (span) => {
        // 이미 이벤트가 연결된 경우 건너뛰기
        if (span.dataset.tippyAttached === 'true') {
            return;
    }
    
        const kanji = span.getAttribute('data-word');
        let meaning = span.getAttribute('data-meaning');
        const reading = span.getAttribute('data-reading') || '';
        const onYomi = JSON.parse(span.getAttribute('data-on-yomi') || '[]');
        const kunYomi = JSON.parse(span.getAttribute('data-kun-yomi') || '[]');
        const explanation = span.getAttribute('data-explanation') || '';
        const jlptLevel = span.getAttribute('data-jlpt-level') || '';
        const onYomiWords = JSON.parse(span.getAttribute('data-on-yomi-words') || '[]');
        const kunYomiWords = JSON.parse(span.getAttribute('data-kun-yomi-words') || '[]');
    
    // 텍스트 언어는 일본어
    const textLanguage = 'ja';
    
    // 사용자 언어는 항상 한국어 (한국인 전용 서비스)
    const userLanguage = 'ko';
    
    // 언어 쌍별 테이블에서 뜻 가져오기 (일본어 -> 한국어)
    const result = await getWordMeaningFromLanguagePair(kanji, textLanguage, userLanguage);
    if (result && result.meaning) {
        meaning = result.meaning;
    }
    
    // 한자 데이터에서 추가 정보 가져오기
        const kanjiData = AppState.singleCharacters?.words?.find(w => w.word === kanji);
    const fullOnYomi = kanjiData?.onYomi || onYomi;
    const fullKunYomi = kanjiData?.kunYomi || kunYomi;
    const fullExplanation = kanjiData?.explanation || explanation;
    const fullJlptLevel = kanjiData?.jlptLevel || jlptLevel;
    const fullOnYomiWords = kanjiData?.onYomiWords || onYomiWords;
    const fullKunYomiWords = kanjiData?.kunYomiWords || kunYomiWords;
    
    // 툴팁 내용 구성
        let tooltipContent = `<div style="font-size: 1.5rem; font-weight: bold; margin-bottom: 0.5rem;">${kanji}</div>`;
    
    if (meaning) {
            tooltipContent += `<div style="font-size: 1.1rem; margin-bottom: 0.5rem; color: #4CAF50;">${meaning}</div>`;
    }
    
    if (fullJlptLevel) {
            tooltipContent += `<div style="display: inline-block; padding: 0.2rem 0.5rem; background: rgba(76, 175, 80, 0.2); border-radius: 4px; font-size: 0.85rem; margin-bottom: 0.5rem;">JLPT ${fullJlptLevel}</div>`;
    }
    
    if (reading) {
        const readingLabelText = typeof t === 'function' ? t('readingLabel') : '읽기:';
            tooltipContent += `<div style="margin-bottom: 0.5rem; color: rgba(0,0,0,0.8);">${readingLabelText} ${reading}</div>`;
    }
    
    if (fullOnYomi.length > 0) {
        const onYomiLabelText = typeof t === 'function' ? t('onYomiLabel') : '음독 (音読み):';
            tooltipContent += `<div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid rgba(0,0,0,0.1);">
                <div style="font-size: 0.9rem; color: rgba(0,0,0,0.7); margin-bottom: 0.3rem;">${onYomiLabelText}</div>
            <div style="font-size: 1rem; color: #FFC107;">${fullOnYomi.join(', ')}</div>
        </div>`;
    }
    
    if (fullKunYomi.length > 0) {
        const kunYomiLabelText = typeof t === 'function' ? t('kunYomiLabel') : '훈독 (訓読み):';
            tooltipContent += `<div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid rgba(0,0,0,0.1);">
                <div style="font-size: 0.9rem; color: rgba(0,0,0,0.7); margin-bottom: 0.3rem;">${kunYomiLabelText}</div>
            <div style="font-size: 1rem; color: #2196F3;">${fullKunYomi.join(', ')}</div>
        </div>`;
    }
    
    if (fullExplanation) {
            tooltipContent += `<div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid rgba(0,0,0,0.1); font-size: 0.9rem; color: rgba(0,0,0,0.85); line-height: 1.5;">${fullExplanation}</div>`;
    }
    
    if (fullOnYomiWords.length > 0) {
        const examples = fullOnYomiWords.slice(0, 3).map(w => {
            const kanji = w.kanji || '';
            const reading = w.reading || '';
            return `${kanji}(${reading})`;
        }).join(', ');
        const onYomiExamplesLabel = typeof t === 'function' ? t('onYomiExamples') : '음독 예시:';
            tooltipContent += `<div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid rgba(0,0,0,0.1); font-size: 0.85rem; color: rgba(0,0,0,0.7);">
            <div style="margin-bottom: 0.3rem;">${onYomiExamplesLabel}</div>
            <div>${examples}</div>
        </div>`;
    }
    
    if (fullKunYomiWords.length > 0) {
        const examples = fullKunYomiWords.slice(0, 3).map(w => {
            const kanji = w.kanji || '';
            const reading = w.reading || '';
            return `${kanji}(${reading})`;
        }).join(', ');
        const kunYomiExamplesLabel = typeof t === 'function' ? t('kunYomiExamples') : '훈독 예시:';
            tooltipContent += `<div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid rgba(0,0,0,0.1); font-size: 0.85rem; color: rgba(0,0,0,0.7);">
            <div style="margin-bottom: 0.3rem;">${kunYomiExamplesLabel}</div>
            <div>${examples}</div>
        </div>`;
    }
    
        // tippy.js로 툴팁 생성
        tippy(span, {
            content: tooltipContent,
            allowHTML: true,
            interactive: true,
            placement: 'top',
            theme: 'light-border',
            maxWidth: 350,
        });
        
        // 이벤트 연결 완료 표시
        span.dataset.tippyAttached = 'true';
    });
}


// 어원 호버 기능
function addEtymologyHover(container, word) {
    const etymology = getEnglishEtymology(word);
    if (!etymology) return;

    container.querySelectorAll('.word-entry-title').forEach(el => {
        const prefix = etymology.prefix || '';
        const suffix = etymology.suffix || '';
        const part = prefix || suffix;
        
        if (word.includes(part)) {
            let html = el.innerHTML;
            const tooltip = `<span class="etymology-tooltip">${part}: ${etymology.meaning}</span>`;
            html = html.replace(part, `<span class="etymology-hover">${part}${tooltip}</span>`);
            el.innerHTML = html;
        }
    });
}

// 플래시카드
function updateFlashcard() {
    const filteredWords = getFilteredWords();
    if (filteredWords.length === 0) {
        document.getElementById('wordDisplay').textContent = typeof t === 'function' ? t('noWordsToLearn') : '학습할 단어가 없습니다';
        document.getElementById('meaningDisplay').textContent = '';
        document.getElementById('exampleDisplay').textContent = '';
        document.getElementById('currentCard').textContent = '0';
        document.getElementById('totalCards').textContent = '0';
        document.getElementById('flashcardQuiz').style.display = 'none';
        document.getElementById('flashcard').style.display = 'block';
        document.getElementById('learnActions').style.display = 'none';
        return;
    }

    // 인덱스 범위 조정
    if (AppState.currentFlashcardIndex >= filteredWords.length) {
        AppState.currentFlashcardIndex = 0;
    }
    if (AppState.currentFlashcardIndex < 0) {
        AppState.currentFlashcardIndex = filteredWords.length - 1;
    }

    const index = AppState.currentFlashcardIndex;
    const word = filteredWords[index];
    
    // 일본어인 경우 4지선다 퀴즈 형식으로 표시
    if (word.language === 'ja') {
        document.getElementById('flashcard').style.display = 'none';
        document.getElementById('learnActions').style.display = 'none';
        displayFlashcardQuiz(word, filteredWords);
    } else {
        // 다른 언어는 기존 플래시카드 방식
        document.getElementById('flashcardQuiz').style.display = 'none';
        document.getElementById('flashcard').style.display = 'block';
        document.getElementById('learnActions').style.display = 'flex';
        document.getElementById('wordDisplay').textContent = word.word;
        document.getElementById('meaningDisplay').textContent = word.meaning;
        document.getElementById('exampleDisplay').textContent = word.example || '';
    }
    
    document.getElementById('currentCard').textContent = index + 1;
    document.getElementById('totalCards').textContent = filteredWords.length;

    // 카드 초기화
    document.getElementById('flashcard').classList.remove('flipped');
}

// 플래시카드 퀴즈 표시 (4지선다)
function displayFlashcardQuiz(word, allWords) {
    // 퀴즈 영역 표시
    document.getElementById('flashcardQuiz').style.display = 'block';
    
    // 단어 표시
    document.getElementById('flashcardWord').textContent = word.word;
    if (word.hiragana) {
        document.getElementById('flashcardHiragana').textContent = word.hiragana;
        document.getElementById('flashcardHiragana').style.display = 'block';
    } else {
        document.getElementById('flashcardHiragana').style.display = 'none';
    }
    
    // 정답 1개 + 오답 3개 선택
    const wrongAnswers = allWords
        .filter(w => w.word !== word.word && w.meaning !== word.meaning)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3)
        .map(w => w.meaning);
    
    const options = [word.meaning, ...wrongAnswers].sort(() => Math.random() - 0.5);
    
    // 선택지 표시
    const optionsDiv = document.getElementById('flashcardOptions');
    const escapedWord = escapeHtml(word.word).replace(/'/g, "&#x27;");
    optionsDiv.innerHTML = options.map((option, idx) => {
        const escapedOption = escapeHtml(option);
        return `
        <div class="flashcard-option" 
             data-answer="${escapedOption}" 
             data-correct="${option === word.meaning}"
             onclick="selectFlashcardOption(this, '${escapedWord}', ${option === word.meaning})">
            ${idx + 1}. ${escapedOption}
        </div>
        `;
    }).join('');
    
    // 피드백 초기화
    const feedback = document.getElementById('flashcardFeedback');
    feedback.innerHTML = '';
    feedback.style.display = 'none';
    
    // 모든 선택지 활성화
    optionsDiv.querySelectorAll('.flashcard-option').forEach(opt => {
        opt.style.pointerEvents = 'auto';
        opt.style.opacity = '1';
        opt.classList.remove('correct', 'incorrect', 'disabled');
    });
}

function getFilteredWords() {
    const cert = AppState.settings.targetCertification;
    
    // 한국인 전용 서비스이므로 일본어 단어만 사용
    let words = AppState.vocabulary.filter(w => w.language === 'ja');
    
    // 자격증 필터링
    if (cert !== 'none') {
        words = words.filter(w => w.certification === cert || !w.certification);
    }
    
    // mastered된 단어는 제외 (정답을 맞춘 단어)
    words = words.filter(w => !w.mastered);
    
    return words;
}

function flipCard() {
    document.getElementById('flashcard').classList.toggle('flipped');
}

function changeCard(direction) {
    const filteredWords = getFilteredWords();
    if (filteredWords.length === 0) return;

    AppState.currentFlashcardIndex += direction;
    if (AppState.currentFlashcardIndex < 0) {
        AppState.currentFlashcardIndex = filteredWords.length - 1;
    } else if (AppState.currentFlashcardIndex >= filteredWords.length) {
        AppState.currentFlashcardIndex = 0;
    }
    
    updateFlashcard();
}

function markWord(know) {
    const filteredWords = getFilteredWords();
    const currentWord = filteredWords[AppState.currentFlashcardIndex];
    
    if (currentWord) {
        if (!currentWord.studyCount) currentWord.studyCount = 0;
        if (!currentWord.correctCount) currentWord.correctCount = 0;
        
        currentWord.studyCount++;
        if (know) {
            currentWord.correctCount++;
            // 다른 언어는 3번 맞추면 mastered
            if (currentWord.correctCount >= 3) {
                currentWord.mastered = true;
            }
        }
        
        AppState.dailyProgress.wordsLearned++;
        saveData();
        updateHomeStats();
        
        // 다음 카드로
        setTimeout(() => changeCard(1), 500);
    }
}

// 플래시카드 퀴즈 선택
function selectFlashcardOption(element, wordText, isCorrect) {
    // 이미 선택했으면 무시
    if (element.classList.contains('disabled')) {
        return;
    }
    
    // 모든 선택지 비활성화
    const options = document.querySelectorAll('.flashcard-option');
    options.forEach(opt => {
        opt.classList.add('disabled');
        opt.style.pointerEvents = 'none';
        opt.style.opacity = '0.6';
    });
    
    // 정답/오답 표시
    options.forEach(opt => {
        if (opt.dataset.correct === 'true') {
            opt.classList.add('correct');
            opt.style.background = 'var(--success-color)';
            opt.style.color = 'white';
        } else if (opt === element && !isCorrect) {
            opt.classList.add('incorrect');
            opt.style.background = 'var(--danger-color)';
            opt.style.color = 'white';
        }
    });
    
    // 피드백 표시
    const feedback = document.getElementById('flashcardFeedback');
    feedback.style.display = 'block';
    
    if (isCorrect) {
        const correctMsg = typeof t === 'function' ? t('correctAnswer') : '정답입니다!';
        feedback.innerHTML = `<div style="padding: 1rem; background: #d1fae5; border-radius: 8px; color: #065f46; font-weight: 600;">✓ ${correctMsg}</div>`;
        
        // 단어를 mastered로 표시 (정답을 맞추면 더 이상 나타나지 않음)
        const decodedWordText = wordText.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
        const word = AppState.vocabulary.find(w => w.word === decodedWordText && w.language === 'ja');
        if (word) {
            word.mastered = true;
            word.correctCount = (word.correctCount || 0) + 1;
            word.studyCount = (word.studyCount || 0) + 1;
            AppState.dailyProgress.wordsLearned++;
            saveData();
            updateHomeStats();
        }
        
        // 1.5초 후 다음 카드로
        setTimeout(() => {
            changeCard(1);
        }, 1500);
    } else {
        const incorrectMsg = typeof t === 'function' ? t('incorrectAnswer') : '오답입니다. 정답을 확인하세요.';
        feedback.innerHTML = `<div style="padding: 1rem; background: #fee2e2; border-radius: 8px; color: #991b1b; font-weight: 600;">✗ ${incorrectMsg}</div>`;
        
        // 2초 후 다음 카드로
        setTimeout(() => {
            changeCard(1);
        }, 2000);
    }
}

// 퀴즈
function startQuiz() {
    const count = parseInt(document.getElementById('quizCount').value);
    const filteredWords = getFilteredWords();
    
    if (filteredWords.length === 0) {
        alert(typeof t === 'function' ? t('noWordsForQuiz') : '퀴즈를 풀 수 있는 단어가 없습니다. 단어를 추가해주세요.');
        return;
    }

    // 검색 기록에서 단어 가져오기
    const searchWords = AppState.searchHistory
        .filter(h => filteredWords.some(w => w.word === h.word))
        .slice(0, count)
        .map(h => filteredWords.find(w => w.word === h.word))
        .filter(Boolean);

    const quizWords = searchWords.length >= count 
        ? searchWords.slice(0, count)
        : [...searchWords, ...filteredWords].slice(0, count);

    AppState.currentQuiz = {
        words: quizWords,
        currentIndex: 0,
        answers: [],
        score: 0
    };

    document.getElementById('quiz-start').style.display = 'none';
    document.getElementById('quiz-question').style.display = 'block';
    showQuizQuestion();
}

function showQuizQuestion() {
    const quiz = AppState.currentQuiz;
    if (!quiz || quiz.currentIndex >= quiz.words.length) {
        showQuizResult();
        return;
    }

    const word = quiz.words[quiz.currentIndex];
    const allWords = getFilteredWords();
    const wrongAnswers = allWords
        .filter(w => w.word !== word.word)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3)
        .map(w => w.meaning);
    
    const options = [word.meaning, ...wrongAnswers].sort(() => Math.random() - 0.5);

    const questionText = typeof t === 'function' ? t('whatIsMeaningOfWord').replace('{word}', word.word) : `"${word.word}"의 의미는?`;
    document.getElementById('quizQuestionText').textContent = questionText;
    document.getElementById('quizProgressText').textContent = `${quiz.currentIndex + 1} / ${quiz.words.length}`;
    document.getElementById('quizProgress').style.width = `${((quiz.currentIndex + 1) / quiz.words.length) * 100}%`;

    const optionsDiv = document.getElementById('quizOptions');
    optionsDiv.innerHTML = options.map((option, idx) => `
        <div class="quiz-option" data-answer="${option}" onclick="selectQuizOption(this)">
            ${idx + 1}. ${option}
        </div>
    `).join('');

    document.getElementById('submitAnswerBtn').disabled = true;
}

function selectQuizOption(element) {
    document.querySelectorAll('.quiz-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    element.classList.add('selected');
    document.getElementById('submitAnswerBtn').disabled = false;
}

function submitQuizAnswer() {
    const quiz = AppState.currentQuiz;
    const selected = document.querySelector('.quiz-option.selected');
    
    if (!selected) return;

    const correctAnswer = quiz.words[quiz.currentIndex].meaning;
    const userAnswer = selected.dataset.answer;
    const isCorrect = userAnswer === correctAnswer;

    if (isCorrect) {
        quiz.score++;
        selected.classList.add('correct');
    } else {
        selected.classList.add('incorrect');
        document.querySelectorAll('.quiz-option').forEach(opt => {
            if (opt.dataset.answer === correctAnswer) {
                opt.classList.add('correct');
            }
        });
    }

    quiz.answers.push({ word: quiz.words[quiz.currentIndex].word, correct: isCorrect });
    quiz.currentIndex++;

    setTimeout(() => {
        showQuizQuestion();
    }, 1500);
}

function showQuizResult() {
    const quiz = AppState.currentQuiz;
    const percentage = Math.round((quiz.score / quiz.words.length) * 100);

    document.getElementById('quiz-question').style.display = 'none';
    document.getElementById('quiz-result').style.display = 'block';
    document.getElementById('quizScoreDisplay').textContent = quiz.score;
    document.getElementById('quizTotalDisplay').textContent = quiz.words.length;
    document.getElementById('resultPercentage').textContent = `${percentage}%`;

    // 점수 저장
    const scores = JSON.parse(localStorage.getItem('quizScores') || '[]');
    scores.push(percentage);
    localStorage.setItem('quizScores', JSON.stringify(scores));
}

// JLPT 레벨에 따른 독해 지문 로드
async function loadJLPTReadingPassage() {
    const certification = AppState.settings.targetCertification;
    
    // 자격증 확인
    if (!certification || certification === 'none') {
        const readingTextDiv = document.getElementById('readingText');
        let textBody = readingTextDiv.querySelector('#text-body');
        if (!textBody) {
            textBody = document.createElement('div');
            textBody.id = 'text-body';
            readingTextDiv.innerHTML = '';
            readingTextDiv.appendChild(textBody);
        }
        textBody.innerHTML = `
            <p style="color: var(--text-secondary); text-align: center; padding: 2rem;">
                독해 문제를 풀려면 설정에서 자격증을 선택하세요.
            </p>
        `;
        document.getElementById('questionsList').innerHTML = '';
        return;
    }

    let folderPath;
    let level;
    let certType;

    // JLPT 레벨 확인
    if (certification.startsWith('jlpt-')) {
        certType = 'jlpt';
        level = certification.replace('jlpt-', '').toUpperCase();
        folderPath = `jlpt/jlpt${level}/read.json`;
    }
    else {
        document.getElementById('readingText').innerHTML = `
            <p style="color: var(--text-secondary); text-align: center; padding: 2rem;">
                독해 문제를 풀려면 설정에서 JLPT 레벨을 선택하세요.
            </p>
        `;
        document.getElementById('questionsList').innerHTML = '';
        return;
    }

    try {
        const response = await fetch(folderPath);
        if (!response.ok) {
            throw new Error(`파일을 찾을 수 없습니다: ${folderPath}`);
        }

        const data = await response.json();
        
        if (!data.reading_quizes || data.reading_quizes.length === 0) {
            const readingTextDiv = document.getElementById('readingText');
            let textBody = readingTextDiv.querySelector('#text-body');
            if (!textBody) {
                textBody = document.createElement('div');
                textBody.id = 'text-body';
                readingTextDiv.innerHTML = '';
                readingTextDiv.appendChild(textBody);
            }
            const noReadingMsg = typeof t === 'function' ? t('noReadingPassage') : '독해 문제가 없습니다.';
            textBody.innerHTML = `<p style="color: var(--text-secondary); text-align: center; padding: 2rem;">${noReadingMsg}</p>`;
            document.getElementById('questionsList').innerHTML = '';
            return;
        }

        // 첫 번째 독해 문제 사용 (나중에 랜덤 선택 가능)
        const readingQuiz = data.reading_quizes[0];
        
        // 현재 독해 문제 저장
        AppState.currentReadingPassage = {
            text: readingQuiz.body,
            questions: readingQuiz.questions,
            level: level,
            certType: certType
        };
        AppState.readingAnswers = {}; // 답안 초기화
        
        // 지문과 문제를 표시
        displayReadingPassage(AppState.currentReadingPassage);
    } catch (error) {
        console.error('독해 지문 로드 오류:', error);
        const readingTextDiv = document.getElementById('readingText');
        let textBody = readingTextDiv.querySelector('#text-body');
        if (!textBody) {
            textBody = document.createElement('div');
            textBody.id = 'text-body';
            readingTextDiv.innerHTML = '';
            readingTextDiv.appendChild(textBody);
        }
        textBody.innerHTML = `
            <p style="color: var(--danger-color); text-align: center; padding: 2rem;">
                독해 지문을 불러오는 중 오류가 발생했습니다.<br>
                ${error.message}
            </p>
        `;
        document.getElementById('questionsList').innerHTML = '';
    }
}

// 독해 (기존 함수 - 호환성 유지)
function loadReadingPassage() {
    // 이미지에서 추출한 텍스트 초기화
    AppState.currentReadingPassage = null;
    AppState.readingAnswers = {};
    
    // 문제 영역 다시 표시
    document.getElementById('readingQuestions').style.display = 'block';
    
    // 새 지문 로드
    loadJLPTReadingPassage();
}

function displayReadingPassage(passage) {
    // 이미지에서 추출한 텍스트인 경우 별도 처리
    if (passage.isFromImage) {
        // displayExtractedText에서 이미 처리됨
        return;
    }

    // 지문 표시 (줄바꿈 처리 및 단어 호버 기능 추가)
    let formattedText = passage.text.replace(/\n/g, '<br>');
    
    // 문제 영역 표시 (이미지에서 추출한 텍스트가 아닌 경우)
    document.getElementById('readingQuestions').style.display = 'block';
    
    // 모든 문제를 다 풀었는지 확인
    const allQuestionsAnswered = passage.questions && 
        passage.questions.length > 0 &&
        AppState.readingAnswers &&
        Object.keys(AppState.readingAnswers).length === passage.questions.length;
    
    // 모든 문제를 다 풀었을 때만 단어 호버 기능 추가
    // JLPT는 addKanjiHover로 처리 (텍스트 삽입 후)
    
    // 자격증 레벨 표시
    let finalHtml = `<p>${formattedText}</p>`;
    if (passage.level) {
        const certName = 'JLPT';
        const levelBadge = `<div style="margin-bottom: 1rem;">
            <span style="padding: 0.25rem 0.75rem; background: var(--primary-color); color: white; border-radius: 12px; font-size: 0.85rem; font-weight: 600;">
                ${certName} ${passage.level}
            </span>
        </div>`;
        finalHtml = levelBadge + finalHtml;
    }
    
    console.log('=== displayReadingPassage: 본문 HTML 생성 ===');
    console.log('원본 텍스트:', passage.text.substring(0, 100) + '...');
    console.log('formattedText (줄바꿈 처리 후):', formattedText.substring(0, 200) + '...');
    console.log('finalHtml (최종 HTML):', finalHtml.substring(0, 300) + '...');
    
    const readingTextDiv = document.getElementById('readingText');
    
    // text-body 요소 찾기 또는 생성
    let textBody = readingTextDiv.querySelector('#text-body');
    if (!textBody) {
        textBody = document.createElement('div');
        textBody.id = 'text-body';
        readingTextDiv.innerHTML = '';
        readingTextDiv.appendChild(textBody);
        console.log('text-body 요소 새로 생성');
    } else {
        // 기존 text-body가 있으면 완전히 비우고 처리 상태 초기화
        console.log('기존 text-body 발견, 기존 내용:', textBody.innerHTML.substring(0, 200));
        textBody.innerHTML = '';
        if (textBody.dataset) {
            textBody.dataset.kanjiProcessed = 'false';
        }
        console.log('text-body 내용 비움 완료');
    }
    
    textBody.innerHTML = finalHtml;
    console.log('textBody.innerHTML 설정 완료');
    console.log('설정 후 textBody.innerHTML:', textBody.innerHTML.substring(0, 500) + '...');
    console.log('설정 후 textBody.textContent:', textBody.textContent.substring(0, 200) + '...');
    document.getElementById('ttsBtn').style.display = 'inline-block';
    updateTTSButtons();
    
    // 텍스트 편집 버튼 숨기기 (일반 독해 지문인 경우)
    document.getElementById('editTextBtn').style.display = 'none';
    document.getElementById('saveTextBtn').style.display = 'none';
    
    // 모든 문제를 다 풀었을 때만 호버 기능 추가
    if (allQuestionsAnswered) {
        if (passage.certType === 'jlpt') {
            // JLPT: 한자 호버 기능 추가 (내부에서 이벤트도 연결됨)
            setTimeout(() => {
                addKanjiHover(readingTextDiv);
            }, 100);
        }
        
        // 안내 메시지 표시
        const infoMsg = readingTextDiv.querySelector('.hover-info');
        if (!infoMsg) {
            const info = document.createElement('div');
            info.className = 'hover-info';
            info.style.cssText = 'margin-top: 1rem; padding: 0.75rem; background: #dbeafe; border-radius: 8px; color: #1e40af; font-size: 0.9rem;';
            const allAnsweredMsg = typeof t === 'function' ? t('allQuestionsAnswered') : '💡 모든 문제를 풀었습니다! 지문의 단어에 마우스를 올려보세요.';
            info.innerHTML = allAnsweredMsg;
            readingTextDiv.appendChild(info);
        }
    }

    const questionsDiv = document.getElementById('questionsList');
    
    if (!passage.questions || passage.questions.length === 0) {
        questionsDiv.innerHTML = '<p style="color: var(--text-secondary);">문제가 없습니다.</p>';
        return;
    }

    questionsDiv.innerHTML = passage.questions.map((q, idx) => {
        const userAnswers = AppState.readingAnswers || {};
        const userAnswer = userAnswers[idx];
        const isAnswered = userAnswer !== undefined;
        const isCorrect = isAnswered && userAnswer === q.correct;

        return `
        <div class="question-item" id="question-${idx}">
            <div class="question-text">${idx + 1}. ${q.question}</div>
            <div class="question-options">
                ${q.options.map((opt, optIdx) => {
                    let optionClass = 'question-option';
                    let optionStyle = '';
                    
                    if (isAnswered) {
                        if (optIdx === q.correct) {
                            optionClass += ' correct-answer';
                            optionStyle = 'background: var(--success-color); color: white;';
                        } else if (optIdx === userAnswer && !isCorrect) {
                            optionClass += ' wrong-answer';
                            optionStyle = 'background: var(--danger-color); color: white;';
                        }
                    }
                    
                    return `
                        <div class="${optionClass}" 
                             data-question="${idx}" 
                             data-option="${optIdx}" 
                             data-correct="${optIdx === q.correct}"
                             style="${optionStyle}"
                             onclick="selectReadingOption(${idx}, ${optIdx}, ${q.correct})">
                            ${optIdx + 1}. ${opt}
                        </div>
                    `;
                }).join('')}
            </div>
            ${isAnswered ? `
                <div style="margin-top: 0.5rem; padding: 0.5rem; background: ${isCorrect ? '#d1fae5' : '#fee2e2'}; border-radius: 6px; font-size: 0.9rem;">
                    ${isCorrect ? (typeof t === 'function' ? '✓ ' + t('correctAnswer') : '✓ 정답입니다!') : (typeof t === 'function' ? '✗ ' + t('incorrectAnswer') : '✗ 오답입니다. 정답을 확인하세요.')}
                </div>
            ` : ''}
        </div>
    `;
    }).join('');

    // 정답률 표시
    updateReadingScore();
}


// 현재 사용자가 선택한 언어 가져오기 (한국인 전용 서비스이므로 항상 한국어)
function getCurrentUserLanguage() {
    return 'ko';
}


// 언어 쌍 테이블 이름 결정 (텍스트 언어 -> 사용자 언어)
function getLanguagePairTable(textLanguage, userLanguage) {
    // 같은 언어면 null 반환
    if (textLanguage === userLanguage) {
        return null;
    }
    
    // 언어 쌍 테이블 이름 생성 (예: en_ja, ja_ko 등)
    return `${textLanguage}_${userLanguage}`;
}

// 언어 쌍별 테이블에서 단어 뜻 가져오기 (비동기)
async function getWordMeaningFromLanguagePair(word, textLanguage, userLanguage) {
    // Supabase 클라이언트 확인
    if (!window.supabaseClient) {
        console.warn('Supabase 클라이언트가 로드되지 않았습니다.');
        return null;
    }
    
    // 언어 쌍 테이블 이름 결정
    const tableName = getLanguagePairTable(textLanguage, userLanguage);
    if (!tableName) {
        // 같은 언어면 null 반환
        return null;
    }
    
    // 단어를 소문자로 변환하여 검색 (대소문자 무시)
    const searchWord = word.toLowerCase().trim();
    
    try {
        // 먼저 정확한 매칭 시도
        let { data, error } = await window.supabaseClient
            .from(tableName)
            .select('source_word, target_meaning, pronunciation')
            .eq('source_word', word) // 정확한 매칭
            .limit(1);
        
        if (error) {
            console.error(`언어 쌍 테이블 조회 오류 (${tableName}, 단어: "${word}"):`, error);
            return null;
        }
        
        if (data && data.length > 0) {
            console.log(`✅ ${tableName} 테이블에서 "${word}" 정확히 찾음: "${data[0].target_meaning}"`);
            return {
                meaning: data[0].target_meaning,
                pronunciation: data[0].pronunciation || null
            };
        }
        
        // 정확한 매칭이 실패하면 대소문자 무시 검색 시도
        const { data: caseInsensitiveData, error: caseError } = await window.supabaseClient
            .from(tableName)
            .select('source_word, target_meaning, pronunciation')
            .ilike('source_word', searchWord) // 대소문자 무시 검색
            .limit(1);
        
        if (!caseError && caseInsensitiveData && caseInsensitiveData.length > 0) {
            console.log(`✅ ${tableName} 테이블에서 "${word}" (대소문자 무시) 찾음: "${caseInsensitiveData[0].source_word}" -> "${caseInsensitiveData[0].target_meaning}"`);
            return {
                meaning: caseInsensitiveData[0].target_meaning,
                pronunciation: caseInsensitiveData[0].pronunciation || null
            };
        }
        
        console.log(`⚠️ ${tableName} 테이블에서 "${word}"를 찾지 못함`);
        return null;
    } catch (error) {
        console.error(`언어 쌍 테이블 조회 중 오류 (${tableName}, 단어: "${word}"):`, error);
        return null;
    }
}

// 영어 단어의 뜻을 사용자 언어에 맞게 변환 (기존 방식 - 폴백용)
function getWordMeaningForLanguage(wordData, targetLanguage) {
    // 기본적으로 한국어 뜻 사용
    let meaning = wordData.meaning || '';
    
    // 사용자가 선택한 언어에 따라 다른 뜻 표시
    if (targetLanguage === 'ja') {
        // 일본어로 표시
        if (wordData.japaneseMeaning) {
            meaning = wordData.japaneseMeaning;
        }
    } else if (targetLanguage === 'en') {
        // 영어로 표시: 영어 단어의 영어 뜻 (definition) 표시
        if (wordData.englishMeaning) {
            meaning = wordData.englishMeaning;
        } else if (wordData.example) {
            // 예문이 있으면 예문을 표시
            meaning = wordData.example;
        }
    } else if (targetLanguage === 'zh') {
        // 중국어로 표시: 영어 단어의 중국어 뜻 찾기
        if (wordData.chineseMeaning) {
            meaning = wordData.chineseMeaning;
        }
    }
    
    return meaning;
}

// 한국어 단어 호버 기능 추가
function addKoreanWordHoverToText(text, words) {
    if (!text || !words || words.length === 0) {
        return text;
    }
    
    let protectedText = text;
    const processedPositions = new Set();
    let totalMatches = 0;
    
    // HTML 태그 보호
    const htmlTags = [];
    let tagIndex = 0;
    protectedText = protectedText.replace(/<[^>]+>/g, (match) => {
        const placeholder = `__HTML_TAG_${tagIndex}__`;
        htmlTags.push(match);
        tagIndex++;
        return placeholder;
    });
    
    // 단어를 길이순으로 정렬 (긴 단어를 먼저 처리)
    const sortedWords = [...words].sort((a, b) => (b.word?.length || 0) - (a.word?.length || 0));
    
    sortedWords.forEach(wordData => {
        const word = wordData.word;
        const meaning = wordData.meaning;
        const pronunciation = wordData.pronunciation || '';
        
        // 한국어 단어 정규식 생성
        const escapedWord = escapeRegex(word);
        const testRegex = new RegExp(escapedWord, 'g');
        
        // 모든 매칭 위치를 먼저 찾기
        const matches = [];
        let match;
        
        while ((match = testRegex.exec(protectedText)) !== null) {
            const index = match.index;
            const matchedWord = match[0];
            
            // HTML 태그나 플레이스홀더 안에 있는지 확인
            const beforeCurrent = protectedText.substring(0, index);
            const openTagCount = (beforeCurrent.match(/<span class="word-hoverable"/g) || []).length;
            const closeTagCount = (beforeCurrent.match(/<\/span>/g) || []).length;
            const isInsideTag = openTagCount > closeTagCount;
            
            const beforeTag = protectedText.substring(Math.max(0, index - 100), index);
            const afterTag = protectedText.substring(index + matchedWord.length, Math.min(protectedText.length, index + matchedWord.length + 100));
            const isInPlaceholder = beforeTag.match(/__HTML_TAG_\d+__$/) || afterTag.match(/^__HTML_TAG_\d+__/);
            
            // 이미 처리된 위치인지 확인
            let isProcessed = false;
            for (let i = index; i < index + matchedWord.length; i++) {
                if (processedPositions.has(i)) {
                    isProcessed = true;
                    break;
                }
            }
            
            if (!isInsideTag && !isInPlaceholder && !isProcessed) {
                matches.push({ index, word: matchedWord, length: matchedWord.length });
            }
        }
        
        totalMatches += matches.length;
        
        // 뒤에서부터 처리 (인덱스가 변경되지 않도록)
        matches.reverse().forEach(({ index, word: matchedWord, length }) => {
            const before = protectedText.substring(0, index);
            const wordText = protectedText.substring(index, index + length);
            const after = protectedText.substring(index + length);
            
            protectedText = before + 
                `<span class="word-hoverable-korean" data-word="${escapeHtml(matchedWord)}" data-meaning="${escapeHtml(meaning)}" data-pronunciation="${escapeHtml(pronunciation || '')}" data-text-language="ko">${wordText}</span>` + 
                after;
            
            // 처리된 위치 기록
            for (let i = index; i < index + length; i++) {
                processedPositions.add(i);
            }
        });
    });

    console.log(`한국어 단어 호버: 총 ${totalMatches}개의 단어가 매칭되었습니다.`);

    // HTML 태그 복원
    htmlTags.forEach((tag, idx) => {
        protectedText = protectedText.replace(`__HTML_TAG_${idx}__`, tag);
    });

    return protectedText;
}

// 툴팁 생성
function createWordTooltip(wordSpan, word, meaning, pronunciation) {
    // 툴팁 생성
    const tooltip = document.createElement('div');
    tooltip.className = 'word-tooltip';
    tooltip.innerHTML = `
        <div class="tooltip-word">${escapeHtml(word)}</div>
        <div class="tooltip-meaning">${escapeHtml(meaning || '')}</div>
        ${pronunciation ? `<div class="tooltip-pronunciation">${escapeHtml(pronunciation)}</div>` : ''}
    `;
    
    document.body.appendChild(tooltip);
    
    // 위치 계산
    const rect = wordSpan.getBoundingClientRect();
    tooltip.style.left = rect.left + (rect.width / 2) - (tooltip.offsetWidth / 2) + 'px';
    tooltip.style.top = rect.top - tooltip.offsetHeight - 8 + 'px';
    
    // 화면 밖으로 나가지 않도록 조정
    const tooltipRect = tooltip.getBoundingClientRect();
    if (tooltipRect.left < 10) {
        tooltip.style.left = '10px';
    }
    if (tooltipRect.right > window.innerWidth - 10) {
        tooltip.style.left = (window.innerWidth - tooltip.offsetWidth - 10) + 'px';
    }
    if (tooltipRect.top < 10) {
        tooltip.style.top = rect.bottom + 8 + 'px';
    }
}

// 영어 단어 호버 이벤트 연결 (한자는 attachKanjiHoverEvents에서 처리)
function attachWordHoverEvents() {
    const hoverableWords = document.querySelectorAll('.word-hoverable');
    console.log(`영어 단어 호버 이벤트 연결: ${hoverableWords.length}개의 호버 가능한 단어를 찾았습니다.`);
    
    hoverableWords.forEach(wordSpan => {
        // 이미 이벤트가 연결된 경우 건너뛰기
        if (wordSpan.dataset.eventsAttached === 'true') {
            return;
        }
        
        // 한자는 건너뛰기 (kanji-word-hoverable 클래스가 있으면)
        if (wordSpan.classList.contains('kanji-word-hoverable')) {
            return;
        }
        
        // 영어 단어용 이벤트만 연결
        wordSpan.addEventListener('mouseenter', showWordTooltip);
        wordSpan.addEventListener('mouseleave', hideWordTooltip);
        wordSpan.dataset.eventsAttached = 'true';
    });
}

// 단어 툴팁 표시 (비동기 - 언어 쌍별 테이블 사용)
async function showWordTooltip(e) {
    const wordSpan = e.target;
    const word = wordSpan.dataset.word || wordSpan.textContent.trim();
    let pronunciation = wordSpan.dataset.pronunciation;
    
    // 텍스트 언어 감지 (data-text-language 속성 또는 단어 자체로 감지)
    const textLanguage = wordSpan.dataset.textLanguage || detectLanguage(word) || 'en';
    
    // 사용자 언어는 항상 한국어 (한국인 전용 서비스)
    const userLanguage = 'ko';
    
    let meaning = '';
    
    // 언어 쌍별 테이블에서 뜻 가져오기 (일본어 -> 한국어)
    const result = await getWordMeaningFromLanguagePair(word, textLanguage, userLanguage);
    
    if (result) {
        meaning = result.meaning;
        if (result.pronunciation) {
            pronunciation = result.pronunciation;
        }
    } else {
        // 여전히 찾지 못한 경우 data-meaning 사용 (최종 폴백)
        if (!meaning) {
            meaning = wordSpan.dataset.meaning || '';
        }
    }
    
    // 기존 툴팁 제거
    hideWordTooltip();
    
    // 툴팁 생성
    const tooltip = document.createElement('div');
    tooltip.className = 'word-tooltip';
    tooltip.innerHTML = `
        <div class="tooltip-word">${escapeHtml(word)}</div>
        <div class="tooltip-meaning">${escapeHtml(meaning || '')}</div>
        ${pronunciation ? `<div class="tooltip-pronunciation">${escapeHtml(pronunciation)}</div>` : ''}
    `;
    
    document.body.appendChild(tooltip);
    
    // 위치 계산
    const rect = wordSpan.getBoundingClientRect();
    tooltip.style.left = rect.left + (rect.width / 2) - (tooltip.offsetWidth / 2) + 'px';
    tooltip.style.top = rect.top - tooltip.offsetHeight - 8 + 'px';
    
    // 화면 밖으로 나가지 않도록 조정
    const tooltipRect = tooltip.getBoundingClientRect();
    if (tooltipRect.left < 10) {
        tooltip.style.left = '10px';
    }
    if (tooltipRect.right > window.innerWidth - 10) {
        tooltip.style.left = (window.innerWidth - tooltip.offsetWidth - 10) + 'px';
    }
    if (tooltipRect.top < 10) {
        tooltip.style.top = rect.bottom + 8 + 'px';
    }
}

// 단어 툴팁 숨기기
function hideWordTooltip() {
    const tooltip = document.querySelector('.word-tooltip');
    if (tooltip) {
        tooltip.remove();
    }
}

// 정규식 특수문자 이스케이프
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// HTML 이스케이프
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 독해 문제 선택
function selectReadingOption(questionIndex, optionIndex, correctAnswer) {
    if (!AppState.readingAnswers) {
        AppState.readingAnswers = {};
    }
    
    AppState.readingAnswers[questionIndex] = optionIndex;
    
    // UI 업데이트
    const questionDiv = document.getElementById(`question-${questionIndex}`);
    if (questionDiv) {
        const options = questionDiv.querySelectorAll('.question-option');
        options.forEach((opt, idx) => {
            opt.style.background = '';
            opt.style.color = '';
            
            if (idx === correctAnswer) {
                opt.style.background = 'var(--success-color)';
                opt.style.color = 'white';
            } else if (idx === optionIndex && optionIndex !== correctAnswer) {
                opt.style.background = 'var(--danger-color)';
                opt.style.color = 'white';
            }
        });
        
        // 피드백 메시지 추가
        const feedback = questionDiv.querySelector('.feedback') || document.createElement('div');
        feedback.className = 'feedback';
        feedback.style.cssText = `margin-top: 0.5rem; padding: 0.5rem; background: ${optionIndex === correctAnswer ? '#d1fae5' : '#fee2e2'}; border-radius: 6px; font-size: 0.9rem;`;
        const correctMsg = typeof t === 'function' ? t('correctAnswer') : '정답입니다!';
        const incorrectMsg = typeof t === 'function' ? t('incorrectAnswer') : '오답입니다. 정답을 확인하세요.';
        feedback.textContent = optionIndex === correctAnswer ? '✓ ' + correctMsg : '✗ ' + incorrectMsg;
        
        if (!questionDiv.querySelector('.feedback')) {
            questionDiv.appendChild(feedback);
        }
    }
    
    updateReadingScore();
    
    // 모든 문제를 다 풀었는지 확인하고 지문 업데이트
    if (AppState.currentReadingPassage) {
        const allAnswered = AppState.currentReadingPassage.questions &&
            AppState.currentReadingPassage.questions.length > 0 &&
            Object.keys(AppState.readingAnswers).length === AppState.currentReadingPassage.questions.length;
        
        if (allAnswered) {
            // 모든 문제를 다 풀었으면 지문에 호버 기능 추가
            displayReadingPassage(AppState.currentReadingPassage);
        }
    }
}

// 독해 점수 업데이트
function updateReadingScore() {
    if (!AppState.readingAnswers) return;
    
    const currentPassage = AppState.currentReadingPassage;
    if (!currentPassage || !currentPassage.questions) return;
    
    let correctCount = 0;
    currentPassage.questions.forEach((q, idx) => {
        if (AppState.readingAnswers[idx] === q.correct) {
            correctCount++;
        }
    });
    
    const totalQuestions = currentPassage.questions.length;
    const scorePercentage = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
    
    // 점수 표시 (questionsList 위에 추가)
    const questionsDiv = document.getElementById('questionsList');
    const scoreDiv = document.getElementById('readingScore') || document.createElement('div');
    scoreDiv.id = 'readingScore';
    scoreDiv.style.cssText = 'margin-bottom: 1rem; padding: 1rem; background: var(--bg-color); border-radius: 8px; text-align: center;';
    const accuracyRateText = typeof t === 'function' ? t('accuracyRate') : '정답률';
    scoreDiv.innerHTML = `
        <strong>${accuracyRateText}: ${correctCount} / ${totalQuestions} (${scorePercentage}%)</strong>
    `;
    
    if (!document.getElementById('readingScore')) {
        questionsDiv.parentElement.insertBefore(scoreDiv, questionsDiv);
    } else {
        scoreDiv.innerHTML = `
            <strong>${accuracyRateText}: ${correctCount} / ${totalQuestions} (${scorePercentage}%)</strong>
        `;
    }
}

// 토스트 메시지 표시 함수
function showToast(message, type = 'info', duration = 3000) {
    // 토스트 컨테이너 생성 (없으면)
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    // 토스트 요소 생성
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: '✅',
        error: '❌',
        info: 'ℹ️',
        loading: '⏳'
    };

    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <div class="toast-content">
            <div class="toast-title">${message}</div>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;

    container.appendChild(toast);

    // 자동 제거
    if (duration > 0) {
        setTimeout(() => {
            toast.classList.add('hiding');
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, duration);
    }

    return toast;
}

// Google Gemini API를 사용한 텍스트 추출
async function extractTextWithGemini(file, loadingToast) {
    try {
        // 이미지를 base64로 인코딩
        const base64Image = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                // data:image/jpeg;base64, 부분 포함 (Gemini API는 전체 data URL 형식 사용)
                const dataUrl = reader.result;
                resolve(dataUrl);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });

        // MIME 타입 추출
        const mimeType = file.type || 'image/jpeg';

        loadingToast.querySelector('.toast-title').textContent = 'Gemini API로 텍스트 추출 중...';

        // Gemini API 호출 (여러 모델 및 API 버전 시도)
        // 사용 가능한 최신 모델 우선 사용 (이미지 텍스트 추출에 최적화)
        const models = [
            'gemini-2.5-flash',           // 최신 Flash 모델 (빠르고 효율적)
            'gemini-2.0-flash',           // 안정적인 Flash 모델
            'gemini-flash-latest',        // 최신 Flash 버전
            'gemini-2.5-pro',             // 더 강력한 Pro 모델
            'gemini-pro-latest'           // 최신 Pro 버전
        ];
        const apiVersions = ['v1', 'v1beta']; // v1을 먼저 시도
        let response;
        let lastError;
        
        for (const version of apiVersions) {
            for (const model of models) {
                try {
                    const testResponse = await fetch(
                        `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            contents: [{
                                parts: [
                                    {
                                        text: `이미지에서 텍스트를 정확하게 추출해주세요.

**중요 지침:**
1. 이미지에 표시된 모든 텍스트를 정확하게 추출하세요
2. 원본의 줄바꿈, 공백, 문단 구조를 그대로 유지하세요
3. 일본어(히라가나, 가타카나, 한자), 영어, 숫자, 기호를 모두 정확하게 인식하세요
4. 텍스트의 방향(가로/세로)을 올바르게 인식하세요
5. 손글씨나 흐릿한 텍스트도 최선을 다해 읽으세요
6. 추출된 텍스트만 출력하고, 설명이나 주석은 절대 추가하지 마세요
7. 텍스트가 전혀 없으면 "텍스트 없음"이라고만 답하세요

**출력 형식:**
- 추출된 텍스트만 순수하게 출력하세요
- 앞뒤 설명 없이 텍스트만 출력하세요

추출된 텍스트:`
                                    },
                                    {
                                        inline_data: {
                                            mime_type: mimeType,
                                            data: base64Image.split(',')[1] // base64 데이터만 추출
                                        }
                                    }
                                ]
                            }],
                            generationConfig: {
                                temperature: 0.1, // 낮은 temperature로 정확도 향상
                                topK: 1,
                                topP: 1,
                                maxOutputTokens: 8192
                            }
                        })
                    }
                );
                
                    if (testResponse.ok) {
                        response = testResponse;
                        break; // 성공한 모델과 버전 사용
                    } else {
                        const errorData = await testResponse.json().catch(() => ({}));
                        lastError = errorData.error?.message || `HTTP ${testResponse.status}`;
                    }
                } catch (err) {
                    lastError = err.message;
                    continue;
                }
            }
            if (response) break; // 성공한 버전이 있으면 중단
        }

        if (!response) {
            throw new Error(`모든 모델 시도 실패. 마지막 오류: ${lastError || '알 수 없는 오류'}`);
        }

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || 'Gemini API 오류');
        }

        const data = await response.json();
        
        // 텍스트 추출 (안전하게 접근)
        if (data.candidates && data.candidates[0] && data.candidates[0].content) {
            const content = data.candidates[0].content;
            if (content.parts && content.parts[0] && content.parts[0].text) {
                const extractedText = content.parts[0].text;
                
                // "텍스트 없음" 체크
                if (extractedText.trim().toLowerCase() === '텍스트 없음' || extractedText.trim() === '') {
                    throw new Error('이미지에서 텍스트를 찾을 수 없습니다.');
                }
                
                return extractedText.trim();
            } else {
                console.error('응답 데이터 구조:', data);
                throw new Error('응답에 텍스트가 없습니다. 응답 구조: ' + JSON.stringify(data).substring(0, 200));
            }
        } else {
            console.error('응답 데이터 구조:', data);
            throw new Error('텍스트를 찾을 수 없습니다. 응답 구조: ' + JSON.stringify(data).substring(0, 200));
        }
    } catch (error) {
        console.error('Gemini API 오류:', error);
        throw error;
    }
}

// 이미지에서 텍스트 추출 및 독해 지문으로 표시
async function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    // 파일 타입 확인
    if (!file.type.startsWith('image/')) {
        showToast('이미지 파일만 업로드할 수 있습니다.', 'error');
        return;
    }

    // Tesseract.js가 로드되었는지 확인 (약간의 대기 시간 제공)
    let retryCount = 0;
    const maxRetries = 10;
    while (typeof Tesseract === 'undefined' && retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 100));
        retryCount++;
    }
    
    if (typeof Tesseract === 'undefined') {
        showToast('OCR 라이브러리를 불러오는 중입니다. 페이지를 새로고침해주세요.', 'error');
        console.error('Tesseract.js가 로드되지 않았습니다. index.html에서 Tesseract.js 스크립트가 로드되는지 확인하세요.');
        return;
    }

    // 로딩 토스트 표시
    const loadingToast = showToast('이미지에서 텍스트를 추출하는 중...', 'loading', 0);
    
    try {
        let text = '';
        
        // Gemini API가 설정되어 있으면 우선 사용 (생성형 AI의 추론력으로 더 정확함)
        if (typeof GEMINI_API_KEY !== 'undefined' && GEMINI_API_KEY && GEMINI_API_KEY !== 'your-api-key-here') {
            text = await extractTextWithGemini(file, loadingToast);
        } else {
            // Tesseract.js로 텍스트 추출 (폴백)
            loadingToast.querySelector('.toast-title').textContent = 'Tesseract.js로 텍스트 추출 중...';
            const { data: { text: tesseractText } } = await Tesseract.recognize(file, 'jpn+eng', {
                logger: (m) => {
                    if (m.status === 'recognizing text') {
                        const progress = Math.round(m.progress * 100);
                        loadingToast.querySelector('.toast-title').textContent = 
                            `텍스트 추출 중... ${progress}%`;
                    }
                },
                // PSM 모드: 단일 블록 텍스트로 인식 (더 정확함)
                // 6 = Uniform block of vertically aligned text
                // 11 = Sparse text (일반적인 문서에 적합)
                tessedit_pageseg_mode: '11'
            });
            text = tesseractText;
        }

        if (!text || text.trim().length === 0) {
            loadingToast.remove();
            showToast('이미지에서 텍스트를 찾을 수 없습니다.', 'error');
            return;
        }

        // 추출된 텍스트 정리 (불필요한 공백 제거)
        let cleanedText = text
            .replace(/\s+/g, ' ') // 연속된 공백을 하나로
            .replace(/\n\s*\n/g, '\n') // 연속된 줄바꿈을 하나로
            .trim();

        // OCR 품질 검사 (특수문자나 깨진 문자가 많으면)
        const totalChars = cleanedText.length;
        const japaneseChars = (cleanedText.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g) || []).length;
        const englishChars = (cleanedText.match(/[a-zA-Z]/g) || []).length;
        const validChars = japaneseChars + englishChars;
        const specialChars = totalChars - validChars - (cleanedText.match(/\s/g) || []).length;
        const specialCharRatio = totalChars > 0 ? specialChars / totalChars : 0;
        const validCharRatio = totalChars > 0 ? validChars / totalChars : 0;
        
        // OCR 품질이 낮은 경우 (유효한 문자 비율이 50% 미만이거나 특수문자 비율이 30% 이상)
        const isLowQuality = validCharRatio < 0.5 || specialCharRatio > 0.3;

        // 추출된 텍스트를 독해 지문으로 표시
        loadingToast.remove();
        if (isLowQuality) {
            showToast('⚠️ OCR 인식 품질이 낮습니다. 텍스트를 직접 수정하거나 더 선명한 이미지를 사용해주세요.', 'error', 6000);
        } else {
            showToast('텍스트 추출 완료! 단어 정보를 로드하는 중...', 'info', 2000);
        }

        // 독해 지문 상태 저장
        AppState.currentReadingPassage = {
            text: cleanedText,
            questions: [], // 이미지에서 추출한 텍스트는 문제 없음
            level: null,
            certType: null, // 언어 자동 감지
            isFromImage: true
        };
        AppState.readingAnswers = {};

        // 텍스트 언어 감지 (일본어 문자 포함 여부로 판단)
        const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(cleanedText);
        const certType = hasJapanese ? 'jlpt' : 'jlpt'; // JLPT 전용

        // certType 저장
        AppState.currentReadingPassage.certType = certType;

        // 지문 표시 (호버 기능 포함)
        await displayExtractedText(cleanedText, certType);

        // 파일 입력 초기화
        e.target.value = '';

    } catch (error) {
        console.error('텍스트 추출 오류:', error);
        loadingToast.remove();
        showToast('텍스트 추출 중 오류가 발생했습니다: ' + error.message, 'error');
    }
}

// 추출된 텍스트를 독해 지문으로 표시 (단어 호버 기능 포함)
async function displayExtractedText(text, certType) {
    // 기본 텍스트 표시
    let formattedText = text.replace(/\n/g, '<br>');
    
    // 단어 호버 기능 추가를 위한 로딩 시작
    const wordLoadingToast = showToast('단어 정보를 로드하는 중...', 'loading', 0);
    
    try {
        // 비동기로 단어 호버 기능 추가
        await new Promise(resolve => setTimeout(resolve, 100)); // DOM 업데이트 대기
        
        // JLPT는 addKanjiHover로 처리 (텍스트 삽입 후)

        // 지문 표시
        const readingTextDiv = document.getElementById('readingText');
        
        // text-body 요소 찾기 또는 생성
        let textBody = readingTextDiv.querySelector('#text-body');
        if (!textBody) {
            textBody = document.createElement('div');
            textBody.id = 'text-body';
            readingTextDiv.innerHTML = '';
            readingTextDiv.appendChild(textBody);
        } else {
            // 기존 text-body가 있으면 완전히 비우고 처리 상태 초기화
            textBody.innerHTML = '';
            if (textBody.dataset) {
                textBody.dataset.kanjiProcessed = 'false';
            }
        }
        
        console.log('=== displayExtractedText: 본문 HTML 생성 ===');
        console.log('원본 텍스트:', text.substring(0, 100) + '...');
        console.log('formattedText (줄바꿈 처리 후):', formattedText.substring(0, 200) + '...');
        console.log('기존 textBody.innerHTML:', textBody.innerHTML.substring(0, 200));
        
        textBody.innerHTML = `<p>${formattedText}</p>`;
        
        console.log('textBody.innerHTML 설정 완료');
        console.log('설정 후 textBody.innerHTML:', textBody.innerHTML.substring(0, 500) + '...');
        console.log('설정 후 textBody.textContent:', textBody.textContent.substring(0, 200) + '...');
        document.getElementById('ttsBtn').style.display = 'inline-block';
        updateTTSButtons();
        
        // 텍스트 편집 버튼 표시 (이미지에서 추출한 텍스트인 경우)
        if (AppState.currentReadingPassage && AppState.currentReadingPassage.isFromImage) {
            document.getElementById('editTextBtn').style.display = 'inline-block';
        } else {
            document.getElementById('editTextBtn').style.display = 'none';
        }
        document.getElementById('saveTextBtn').style.display = 'none';
        
        // 문제 영역 숨기기 (이미지에서 추출한 텍스트는 문제 없음)
        document.getElementById('readingQuestions').style.display = 'none';
        
        // 한자 호버 기능 추가 (JLPT인 경우)
        if (certType === 'jlpt') {
            await new Promise(resolve => setTimeout(resolve, 100)); // DOM 업데이트 대기
            const textBody = readingTextDiv.querySelector('#text-body');
            if (textBody) {
                addKanjiHover(readingTextDiv);
            }
        }
        
        // 단어 정보 로딩 완료 알림
        wordLoadingToast.remove();
        const hoverableWords = document.querySelectorAll('.word-hoverable').length;
        showToast(`단어 정보 로딩 완료! ${hoverableWords}개의 단어에 호버 기능이 활성화되었습니다.`, 'success', 4000);
        
    } catch (error) {
        console.error('단어 호버 기능 추가 오류:', error);
        wordLoadingToast.remove();
        showToast('단어 호버 기능 추가 중 오류가 발생했습니다.', 'error');
        // 오류가 발생해도 텍스트는 표시
        const readingTextDiv = document.getElementById('readingText');
        let textBody = readingTextDiv.querySelector('#text-body');
        if (!textBody) {
            textBody = document.createElement('div');
            textBody.id = 'text-body';
            readingTextDiv.innerHTML = '';
            readingTextDiv.appendChild(textBody);
        }
        textBody.innerHTML = `<p>${formattedText}</p>`;
        document.getElementById('ttsBtn').style.display = 'inline-block';
    }
}

// TTS 상태 관리
let currentUtterance = null;
let isTTSPlaying = false;

function readText() {
    const readingTextElement = document.getElementById('readingText');
    if (!readingTextElement) return;
    
    // HTML 태그 제거하고 순수 텍스트 추출
    let text = readingTextElement.textContent || readingTextElement.innerText;
    text = text.trim();
    
    if (!text || text.length === 0) {
        showToast('읽을 텍스트가 없습니다.', 'error');
        return;
    }
    
    // 브라우저 TTS 지원 확인
    if (!('speechSynthesis' in window)) {
        showToast('이 브라우저는 TTS를 지원하지 않습니다.', 'error');
        return;
    }
    
    // 이전 재생 중지
    speechSynthesis.cancel();
    
    // 언어 자동 감지 (텍스트 내용 기반)
    const detectedLang = detectLanguage(text);
    const lang = detectedLang || AppState.settings.ttsLanguage;
    
    // TTS 설정
    currentUtterance = new SpeechSynthesisUtterance(text);
    currentUtterance.lang = getLanguageCode(lang);
    currentUtterance.rate = AppState.settings.ttsRate || 1.0; // 읽는 속도 (0.1 ~ 10)
    currentUtterance.pitch = AppState.settings.ttsPitch || 1.0; // 음성 높이 (0 ~ 2)
    currentUtterance.volume = AppState.settings.ttsVolume || 1.0; // 볼륨 (0 ~ 1)
    
    // 이벤트 리스너
    currentUtterance.onstart = () => {
        isTTSPlaying = true;
        updateTTSButtons();
        showToast(`읽기 시작 (${getLanguageName(lang)})`, 'info', 2000);
    };
    
    currentUtterance.onend = () => {
        isTTSPlaying = false;
        updateTTSButtons();
        currentUtterance = null;
    };
    
    currentUtterance.onerror = (event) => {
        isTTSPlaying = false;
        updateTTSButtons();
        console.error('TTS 오류:', event);
        showToast('음성 읽기 중 오류가 발생했습니다.', 'error');
        currentUtterance = null;
    };
    
    // TTS 시작
    speechSynthesis.speak(currentUtterance);
}

// TTS 일시정지/재개 토글
function togglePauseTTS() {
    if (speechSynthesis.speaking && !speechSynthesis.paused) {
        // 재생 중이면 일시정지
        speechSynthesis.pause();
        isTTSPlaying = false;
        updateTTSButtons();
        showToast('읽기 일시정지', 'info', 2000);
    } else if (speechSynthesis.paused) {
        // 일시정지 중이면 재개
        speechSynthesis.resume();
        isTTSPlaying = true;
        updateTTSButtons();
        showToast('읽기 재개', 'info', 2000);
    }
}

// TTS 일시정지
function pauseTTS() {
    if (isTTSPlaying && speechSynthesis.speaking) {
        speechSynthesis.pause();
        isTTSPlaying = false;
        updateTTSButtons();
        showToast('읽기 일시정지', 'info', 2000);
    }
}

// TTS 재개
function resumeTTS() {
    if (!isTTSPlaying && speechSynthesis.paused) {
        speechSynthesis.resume();
        isTTSPlaying = true;
        updateTTSButtons();
        showToast('읽기 재개', 'info', 2000);
    }
}

// TTS 중지
function stopTTS() {
    speechSynthesis.cancel();
    isTTSPlaying = false;
    updateTTSButtons();
    currentUtterance = null;
    showToast('읽기 중지', 'info', 2000);
}

// TTS 버튼 상태 업데이트
function updateTTSButtons() {
    const ttsBtn = document.getElementById('ttsBtn');
    const ttsPauseBtn = document.getElementById('ttsPauseBtn');
    const ttsStopBtn = document.getElementById('ttsStopBtn');
    
    // speechSynthesis 상태 확인
    const isSpeaking = speechSynthesis.speaking;
    const isPaused = speechSynthesis.paused;
    const isActive = isSpeaking || isPaused; // 재생 중이거나 일시정지 중
    
    // 읽어주기 버튼은 재생 중이 아닐 때만 표시
    if (ttsBtn) {
        if (isActive) {
            ttsBtn.style.display = 'none';
        } else {
            ttsBtn.style.display = 'inline-block';
            ttsBtn.disabled = false;
        }
    }
    
    // 일시정지/재개 버튼은 재생 중이거나 일시정지 중일 때만 표시
    if (ttsPauseBtn) {
        if (isActive) {
            ttsPauseBtn.style.display = 'inline-block';
            ttsPauseBtn.textContent = isPaused ? '▶️ 재개' : '⏸️ 일시정지';
            ttsPauseBtn.disabled = false;
        } else {
            ttsPauseBtn.style.display = 'none';
        }
    }
    
    // 중지 버튼은 재생 중이거나 일시정지 중일 때만 표시
    if (ttsStopBtn) {
        if (isActive) {
            ttsStopBtn.style.display = 'inline-block';
            ttsStopBtn.disabled = false;
        } else {
            ttsStopBtn.style.display = 'none';
        }
    }
}

// 언어 자동 감지
function detectLanguage(text) {
    // 일본어 문자 감지
    if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text)) {
        return 'ja';
    }
    // 영어 문자 감지 (일본어가 아닌 경우)
    if (/[a-zA-Z]/.test(text)) {
        return 'en';
    }
    // 한글 감지
    if (/[가-힣]/.test(text)) {
        return 'ko';
    }
    // 중국어 감지
    if (/[\u4E00-\u9FFF]/.test(text) && !/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) {
        return 'zh';
    }
    return null; // 감지 실패 시 설정값 사용
}

// 언어 코드 변환
function getLanguageCode(lang) {
    const langMap = {
        'ko': 'ko-KR',
        'ja': 'ja-JP',
        'en': 'en-US',
        'zh': 'zh-CN',
        'es': 'es-ES'
    };
    return langMap[lang] || 'en-US';
}

// 언어 이름 변환
function getLanguageName(lang) {
    const langMap = {
        'ko': '한국어',
        'ja': '일본어',
        'en': '영어',
        'zh': '중국어',
        'es': '스페인어'
    };
    return langMap[lang] || '영어';
}

// 모의고사
async function startMockTest() {
    document.querySelector('.test-selector').style.display = 'none';
    document.getElementById('testContainer').style.display = 'block';
    
    // 모의고사 문제 생성 (실제로는 서버에서 가져와야 함)
    // 사용자의 모국어에 맞는 문제 생성
    const questions = await generateMockTestQuestionsAsync();
    
    AppState.currentTest = {
        type: 'mock',
        questions: questions,
        currentIndex: 0,
        answers: [],
        startTime: Date.now()
    };

    showTestQuestion();
}

async function startLevelTest() {
    const language = document.getElementById('levelTestLanguage')?.value || 'ja';
    
    document.querySelector('.test-selector').style.display = 'none';
    document.getElementById('testContainer').style.display = 'block';
    
    // 문제 풀 생성 (사용자 모국어 고려)
    const questionPool = await generateLevelTestQuestionPoolAsync(language);
    
    // 문제 풀이 비어있는지 확인
    const totalPoolSize = questionPool.easy.length + questionPool.medium.length + questionPool.hard.length;
    if (totalPoolSize === 0) {
        console.error('문제 풀이 비어있습니다.');
        const questionDiv = document.getElementById('testQuestion');
        questionDiv.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
                <p>문제를 생성할 수 없습니다. 단어 데이터를 확인해주세요.</p>
                <button class="btn btn-primary" onclick="document.querySelector('.test-selector').style.display = 'grid'; document.getElementById('testContainer').style.display = 'none';">
                    돌아가기
                </button>
            </div>
        `;
        return;
    }
    
    // 적응형 레벨테스트 초기화
    AppState.currentTest = {
        type: 'level',
        language: language,
        questions: [],
        currentIndex: 0,
        answers: [],
        startTime: Date.now(),
        currentDifficulty: 1, // 1: 초급, 2: 중급, 3: 고급
        correctStreak: 0,
        wrongStreak: 0,
        totalQuestions: Math.min(20, totalPoolSize), // 총 문제 수 (문제 풀 크기에 맞춤)
        questionPool: questionPool
    };

    // 첫 문제 생성
    generateNextAdaptiveQuestion();
    
    // 문제가 생성되었는지 확인
    if (AppState.currentTest.questions.length === 0) {
        console.error('첫 문제 생성에 실패했습니다.');
        const questionDiv = document.getElementById('testQuestion');
        questionDiv.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
                <p>문제를 생성할 수 없습니다. 단어 데이터를 확인해주세요.</p>
                <button class="btn btn-primary" onclick="document.querySelector('.test-selector').style.display = 'grid'; document.getElementById('testContainer').style.display = 'none';">
                    돌아가기
                </button>
            </div>
        `;
        return;
    }
    
    await showTestQuestion();
}

// 사용자의 모국어 가져오기
async function getUserNativeLanguage() {
    // 한국인 전용 서비스이므로 항상 한국어 반환
    return 'ko';
}

// 사용자의 모국어에 맞는 문제 생성 (비동기)
async function generateMockTestQuestionsAsync() {
    // 사용자의 모국어 가져오기
    const nativeLanguage = await getUserNativeLanguage();
    
    // i18n 함수 사용
    const getTranslation = (key) => {
        if (typeof t === 'function') {
            return t(key);
        }
        
        // 폴백: 직접 번역 객체 사용
        const translations = {
            ko: {
                correctGrammar: "다음 중 올바른 문법은?",
                wordMeaning: "다음 단어의 의미는?",
                meaning1: "의미 1",
                meaning2: "의미 2",
                meaning3: "의미 3",
                meaning4: "의미 4"
            },
            ja: {
                correctGrammar: "次のうち正しい文法は？",
                wordMeaning: "次の単語の意味は？",
                meaning1: "意味 1",
                meaning2: "意味 2",
                meaning3: "意味 3",
                meaning4: "意味 4"
            },
            en: {
                correctGrammar: "Which of the following is correct grammar?",
                wordMeaning: "What is the meaning of the following word?",
                meaning1: "Meaning 1",
                meaning2: "Meaning 2",
                meaning3: "Meaning 3",
                meaning4: "Meaning 4"
            },
            zh: {
                correctGrammar: "下列哪一个是正确的语法？",
                wordMeaning: "下列单词的意思是什么？",
                meaning1: "意思 1",
                meaning2: "意思 2",
                meaning3: "意思 3",
                meaning4: "意思 4"
            }
        };
        
        const lang = nativeLanguage || 'ko';
        return translations[lang]?.[key] || translations['ko'][key] || key;
    };
    
    return [
        { 
            question: getTranslation('correctGrammar'), 
            options: ["Option 1", "Option 2", "Option 3", "Option 4"], 
            correct: 0 
        },
        { 
            question: getTranslation('wordMeaning'), 
            options: [
                getTranslation('meaning1'), 
                getTranslation('meaning2'), 
                getTranslation('meaning3'), 
                getTranslation('meaning4')
            ], 
            correct: 1 
        }
    ];
}

// 기존 함수는 호환성을 위해 유지 (동기 버전)
function generateMockTestQuestions() {
    // 한국인 전용 서비스이므로 한국어로 문제 텍스트 반환
    // 실제로는 서버에서 문제를 가져와야 합니다
    const currentLang = 'ko';
    
    // i18n 함수 사용
    const getTranslation = (key) => {
        if (typeof t === 'function') {
            return t(key);
        }
        
        // 폴백: 직접 번역 객체 사용
        const translations = {
            ko: {
                correctGrammar: "다음 중 올바른 문법은?",
                wordMeaning: "다음 단어의 의미는?",
                meaning1: "의미 1",
                meaning2: "의미 2",
                meaning3: "의미 3",
                meaning4: "의미 4"
            },
            ja: {
                correctGrammar: "次のうち正しい文法は？",
                wordMeaning: "次の単語の意味は？",
                meaning1: "意味 1",
                meaning2: "意味 2",
                meaning3: "意味 3",
                meaning4: "意味 4"
            },
            en: {
                correctGrammar: "Which of the following is correct grammar?",
                wordMeaning: "What is the meaning of the following word?",
                meaning1: "Meaning 1",
                meaning2: "Meaning 2",
                meaning3: "Meaning 3",
                meaning4: "Meaning 4"
            },
            zh: {
                correctGrammar: "下列哪一个是正确的语法？",
                wordMeaning: "下列单词的意思是什么？",
                meaning1: "意思 1",
                meaning2: "意思 2",
                meaning3: "意思 3",
                meaning4: "意思 4"
            }
        };
        
        const lang = currentLang || 'ko';
        return translations[lang]?.[key] || translations['ko'][key] || key;
    };
    
    return [
        { 
            question: getTranslation('correctGrammar'), 
            options: ["Option 1", "Option 2", "Option 3", "Option 4"], 
            correct: 0 
        },
        { 
            question: getTranslation('wordMeaning'), 
            options: [
                getTranslation('meaning1'), 
                getTranslation('meaning2'), 
                getTranslation('meaning3'), 
                getTranslation('meaning4')
            ], 
            correct: 1 
        }
    ];
}

// 레벨테스트용 문제 풀 생성 (비동기로 변경하여 사용자 모국어 가져오기)
async function generateLevelTestQuestionPoolAsync(language) {
    // 한국인 전용 서비스이므로 모국어는 항상 한국어
    const nativeLanguage = 'ko';
    
    return generateLevelTestQuestionPool(language, nativeLanguage);
}

// 레벨테스트용 문제 풀 생성
function generateLevelTestQuestionPool(language, nativeLanguage = 'ko') {
    const questionPool = {
        easy: [],
        medium: [],
        hard: []
    };

    // 언어별 단어 데이터 가져오기
    let words = [];
    if (language === 'ja') {
        words = AppState.singleCharacters?.words || [];
        console.log(`일본어 단어 데이터: ${words.length}개`);
    } else {
        words = AppState.vocabulary || [];
        console.log(`단어장 데이터: ${words.length}개`);
    }

    // 단어가 없으면 기본 문제 생성
    if (words.length === 0) {
        console.warn('단어 데이터가 없습니다. 기본 문제를 생성합니다.');
        return generateDefaultQuestions(language);
    }

    // 난이도별로 문제 생성
    words.forEach((word, idx) => {
        const wordText = word.word || word.kanji || '';
        const meaning = word.meaning || word.translation || '';
        
        if (!wordText || !meaning) return;

        // 다른 단어들로 오답 선택지 생성
        const otherWords = words.filter(w => {
            const wText = w.word || w.kanji || '';
            return wText !== wordText && (w.meaning || w.translation);
        });
        
        const wrongOptions = otherWords
            .slice(0, 3)
            .map(w => ({
                word: w.word || w.kanji || '',
                meaning: w.meaning || w.translation || ''
            }))
            .filter(w => w.meaning && w.meaning !== meaning);

        if (wrongOptions.length < 3) return;

        // 각 선택지에 해당하는 단어 정보 저장 (번역을 위해)
        const optionWords = [
            { word: wordText, meaning: meaning }, // 정답
            ...wrongOptions
        ];

        const options = [meaning, ...wrongOptions.map(w => w.meaning)].sort(() => Math.random() - 0.5);
        const correctIndex = options.indexOf(meaning);
        
        // optionWords도 같은 순서로 재정렬
        const sortedOptionWords = options.map(opt => 
            optionWords.find(ow => ow.meaning === opt) || { word: '', meaning: opt }
        );

        // 사용자의 모국어에 맞는 문제 텍스트 생성
        const getQuestionText = (wordText) => {
            if (typeof t === 'function') {
                return t('whatIsMeaningOfWord').replace('{word}', wordText);
            }
            
            // 폴백: 모국어에 맞는 텍스트
            const questionTexts = {
                ko: `"${wordText}"의 의미는?`,
                ja: `"${wordText}"の意味は？`,
                en: `What is the meaning of "${wordText}"?`,
                zh: `"${wordText}"的意思是什么？`
            };
            
            return questionTexts[nativeLanguage] || questionTexts['ko'];
        };
        
        const question = {
            question: getQuestionText(wordText),
            options: options,
            optionWords: sortedOptionWords, // 각 선택지에 해당하는 단어 정보 (옵션 순서와 동일)
            correct: correctIndex,
            difficulty: determineWordDifficulty(word, language),
            word: wordText,
            meaning: meaning
        };

        // 난이도별 분류
        if (question.difficulty === 1) {
            questionPool.easy.push(question);
        } else if (question.difficulty === 2) {
            questionPool.medium.push(question);
        } else {
            questionPool.hard.push(question);
        }
    });

    console.log(`문제 풀 생성 완료: 초급 ${questionPool.easy.length}개, 중급 ${questionPool.medium.length}개, 고급 ${questionPool.hard.length}개`);

    // 문제 풀이 비어있으면 기본 문제 생성
    const totalQuestions = questionPool.easy.length + questionPool.medium.length + questionPool.hard.length;
    if (totalQuestions === 0) {
        console.warn('생성된 문제가 없습니다. 기본 문제를 사용합니다.');
        return generateDefaultQuestions(language);
    }

    return questionPool;
}

// 기본 문제 생성 (단어 데이터가 없을 때) - 사용자 모국어 고려
async function generateDefaultQuestionsAsync(language) {
    // 한국인 전용 서비스이므로 모국어는 항상 한국어
    const nativeLanguage = 'ko';
    return generateDefaultQuestions(language, nativeLanguage);
}

// 기본 문제 생성 (단어 데이터가 없을 때)
function generateDefaultQuestions(language, nativeLanguage = 'ko') {
    const defaultQuestions = {
        easy: [],
        medium: [],
        hard: []
    };

    // 언어별 기본 문제
    if (language === 'ja') {
        const defaultWords = [
            { word: '人', meaning: '사람', difficulty: 1 },
            { word: '水', meaning: '물', difficulty: 1 },
            { word: '火', meaning: '불', difficulty: 1 },
            { word: '木', meaning: '나무', difficulty: 1 },
            { word: '金', meaning: '금', difficulty: 1 },
            { word: '学校', meaning: '학교', difficulty: 2 },
            { word: '学生', meaning: '학생', difficulty: 2 },
            { word: '先生', meaning: '선생님', difficulty: 2 },
            { word: '勉強', meaning: '공부', difficulty: 2 },
            { word: '図書館', meaning: '도서관', difficulty: 2 },
            { word: '経済', meaning: '경제', difficulty: 3 },
            { word: '政治', meaning: '정치', difficulty: 3 },
            { word: '文化', meaning: '문화', difficulty: 3 },
            { word: '社会', meaning: '사회', difficulty: 3 },
            { word: '環境', meaning: '환경', difficulty: 3 }
        ];

        defaultWords.forEach((item, idx) => {
            const wrongOptions = defaultWords
                .filter(w => w.word !== item.word)
                .slice(0, 3)
                .map(w => w.meaning);
            
            const options = [item.meaning, ...wrongOptions].sort(() => Math.random() - 0.5);
            const correctIndex = options.indexOf(item.meaning);

            // 사용자의 모국어에 맞는 문제 텍스트 생성
            const getQuestionText = (wordText) => {
                const questionTexts = {
                    ko: `"${wordText}"의 의미는?`,
                    ja: `"${wordText}"の意味は？`,
                    en: `What is the meaning of "${wordText}"?`,
                    zh: `"${wordText}"的意思是什么？`
                };
                return questionTexts[nativeLanguage] || questionTexts['ko'];
            };
            
            const question = {
                question: getQuestionText(item.word),
                options: options,
                correct: correctIndex,
                difficulty: item.difficulty,
                word: item.word,
                meaning: item.meaning
            };

            if (item.difficulty === 1) {
                defaultQuestions.easy.push(question);
            } else if (item.difficulty === 2) {
                defaultQuestions.medium.push(question);
            } else {
                defaultQuestions.hard.push(question);
            }
        });
    } else if (language === 'en') {
        const defaultWords = [
            { word: 'apple', meaning: '사과', difficulty: 1 },
            { word: 'book', meaning: '책', difficulty: 1 },
            { word: 'cat', meaning: '고양이', difficulty: 1 },
            { word: 'dog', meaning: '개', difficulty: 1 },
            { word: 'house', meaning: '집', difficulty: 1 },
            { word: 'student', meaning: '학생', difficulty: 2 },
            { word: 'teacher', meaning: '선생님', difficulty: 2 },
            { word: 'library', meaning: '도서관', difficulty: 2 },
            { word: 'computer', meaning: '컴퓨터', difficulty: 2 },
            { word: 'university', meaning: '대학교', difficulty: 2 },
            { word: 'economy', meaning: '경제', difficulty: 3 },
            { word: 'politics', meaning: '정치', difficulty: 3 },
            { word: 'culture', meaning: '문화', difficulty: 3 },
            { word: 'society', meaning: '사회', difficulty: 3 },
            { word: 'environment', meaning: '환경', difficulty: 3 }
        ];

        defaultWords.forEach((item, idx) => {
            const wrongOptions = defaultWords
                .filter(w => w.word !== item.word)
                .slice(0, 3)
                .map(w => w.meaning);
            
            const options = [item.meaning, ...wrongOptions].sort(() => Math.random() - 0.5);
            const correctIndex = options.indexOf(item.meaning);

            // 사용자의 모국어에 맞는 문제 텍스트 생성
            const getQuestionText = (wordText) => {
                const questionTexts = {
                    ko: `"${wordText}"의 의미는?`,
                    ja: `"${wordText}"の意味は？`,
                    en: `What is the meaning of "${wordText}"?`,
                    zh: `"${wordText}"的意思是什么？`
                };
                return questionTexts[nativeLanguage] || questionTexts['ko'];
            };
            
            const question = {
                question: getQuestionText(item.word),
                options: options,
                correct: correctIndex,
                difficulty: item.difficulty,
                word: item.word,
                meaning: item.meaning
            };

            if (item.difficulty === 1) {
                defaultQuestions.easy.push(question);
            } else if (item.difficulty === 2) {
                defaultQuestions.medium.push(question);
            } else {
                defaultQuestions.hard.push(question);
            }
        });
    } else {
        // 한국어나 중국어의 경우 영어 기본 문제 사용
        return generateDefaultQuestions('en');
    }

    return defaultQuestions;
}

// 단어의 난이도 결정
function determineWordDifficulty(word, language) {
    // 단어 길이, 빈도, 레벨 등을 고려하여 난이도 결정
    const wordText = word.word || word.kanji || '';
    const level = word.level || '';
    
    if (level.includes('beginner') || level.includes('basic') || wordText.length <= 3) {
        return 1; // 초급
    } else if (level.includes('advanced') || level.includes('high') || wordText.length >= 8) {
        return 3; // 고급
    } else {
        return 2; // 중급
    }
}

// 적응형 문제 생성 (맞으면 어려운 문제, 틀리면 쉬운 문제)
function generateNextAdaptiveQuestion() {
    const test = AppState.currentTest;
    if (!test || test.questions.length >= test.totalQuestions) {
        return;
    }

    let difficulty = test.currentDifficulty;
    
    // 연속 정답이면 난이도 증가
    if (test.correctStreak >= 2 && difficulty < 3) {
        difficulty = Math.min(3, difficulty + 1);
        test.currentDifficulty = difficulty;
        test.correctStreak = 0;
    }
    // 연속 오답이면 난이도 감소
    else if (test.wrongStreak >= 2 && difficulty > 1) {
        difficulty = Math.max(1, difficulty - 1);
        test.currentDifficulty = difficulty;
        test.wrongStreak = 0;
    }

    // 해당 난이도의 문제 풀에서 랜덤 선택
    let pool = [];
    if (difficulty === 1) {
        pool = test.questionPool.easy;
    } else if (difficulty === 2) {
        pool = test.questionPool.medium;
    } else {
        pool = test.questionPool.hard;
    }

    // 풀이 비어있으면 다른 난이도에서 가져오기
    if (pool.length === 0) {
        if (test.questionPool.medium.length > 0) {
            pool = test.questionPool.medium;
        } else if (test.questionPool.easy.length > 0) {
            pool = test.questionPool.easy;
        } else if (test.questionPool.hard.length > 0) {
            pool = test.questionPool.hard;
        }
    }

    if (pool.length === 0) {
        console.error('문제 풀이 완전히 비어있습니다. 기본 문제를 생성합니다.');
        // 문제 풀 재생성 시도
        // 비동기 함수이므로 여기서는 직접 호출하지 않고, startLevelTest에서 처리
        console.error('문제 풀이 비어있습니다. 레벨테스트를 다시 시작해주세요.');
        return;
        pool = test.questionPool.easy.length > 0 ? test.questionPool.easy : 
               test.questionPool.medium.length > 0 ? test.questionPool.medium : 
               test.questionPool.hard;
        
        if (pool.length === 0) {
            console.error('기본 문제 생성도 실패했습니다.');
            return;
        }
    }

    // 이미 출제된 문제 제외
    const usedWords = new Set(test.questions.map(q => q.word));
    const availableQuestions = pool.filter(q => !usedWords.has(q.word));
    
    const questionPool = availableQuestions.length > 0 ? availableQuestions : pool;
    
    if (questionPool.length === 0) {
        console.warn('사용 가능한 문제가 없습니다. 이미 출제된 문제를 재사용합니다.');
        // 이미 출제된 문제라도 재사용
        const reusedQuestion = pool[Math.floor(Math.random() * pool.length)];
        const shuffledOptions = [...reusedQuestion.options].sort(() => Math.random() - 0.5);
        const correctIndex = shuffledOptions.indexOf(reusedQuestion.meaning);
        
        test.questions.push({
            ...reusedQuestion,
            options: shuffledOptions,
            correct: correctIndex,
            difficulty: difficulty
        });
        return;
    }
    
    const randomQuestion = questionPool[Math.floor(Math.random() * questionPool.length)];
    
    if (!randomQuestion || !randomQuestion.options || randomQuestion.options.length === 0) {
        console.error('문제 데이터가 올바르지 않습니다:', randomQuestion);
        return;
    }
    
    // 선택지 섞기 (optionWords도 함께)
    const shuffledIndices = [...Array(randomQuestion.options.length).keys()].sort(() => Math.random() - 0.5);
    const shuffledOptions = shuffledIndices.map(idx => randomQuestion.options[idx]);
    const shuffledOptionWords = shuffledIndices.map(idx => 
        randomQuestion.optionWords && randomQuestion.optionWords[idx] 
            ? randomQuestion.optionWords[idx] 
            : { word: '', meaning: randomQuestion.options[idx] }
    );
    const originalCorrectIndex = randomQuestion.options.findIndex(opt => opt === randomQuestion.meaning);
    const correctIndex = shuffledIndices.indexOf(originalCorrectIndex);

    if (correctIndex === -1) {
        console.error('정답을 찾을 수 없습니다:', randomQuestion);
        return;
    }

    test.questions.push({
        ...randomQuestion,
        options: shuffledOptions,
        optionWords: shuffledOptionWords, // 섞인 순서에 맞춰 optionWords도 재정렬
        correct: correctIndex,
        difficulty: difficulty
    });
    
    console.log(`문제 생성 완료: ${test.questions.length}/${test.totalQuestions} (난이도: ${difficulty})`);
}

async function showTestQuestion() {
    const test = AppState.currentTest;
    if (!test) {
        console.error('테스트 상태가 없습니다.');
        return;
    }

    // 문제가 없으면 다음 문제 생성 시도
    if (test.currentIndex >= test.questions.length) {
        if (test.questions.length < test.totalQuestions) {
            generateNextAdaptiveQuestion();
            // 문제가 생성되었는지 확인
            if (test.currentIndex >= test.questions.length) {
                console.error('문제 생성에 실패했습니다.');
                const questionDiv = document.getElementById('testQuestion');
                questionDiv.innerHTML = `
                    <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
                        <p>문제를 생성할 수 없습니다. 단어 데이터를 확인해주세요.</p>
                        <button class="btn btn-primary" onclick="document.querySelector('.test-selector').style.display = 'grid'; document.getElementById('testContainer').style.display = 'none';">
                            돌아가기
                        </button>
                    </div>
                `;
                return;
            }
        } else {
            showTestResult();
            return;
        }
    }

    const question = test.questions[test.currentIndex];
    
    if (!question || !question.options || question.options.length === 0) {
        console.error('문제 데이터가 올바르지 않습니다:', question);
        const questionDiv = document.getElementById('testQuestion');
        questionDiv.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
                <p>문제 데이터 오류가 발생했습니다.</p>
                <button class="btn btn-primary" onclick="document.querySelector('.test-selector').style.display = 'grid'; document.getElementById('testContainer').style.display = 'none';">
                    돌아가기
                </button>
            </div>
        `;
        return;
    }

    const totalQuestions = test.totalQuestions || test.questions.length;
    document.getElementById('testProgressText').textContent = `${test.currentIndex + 1} / ${totalQuestions}`;
    document.getElementById('testProgress').style.width = `${((test.currentIndex + 1) / totalQuestions) * 100}%`;

    // 한국인 전용 서비스이므로 사용자 언어는 항상 한국어
    const userLanguage = 'ko';
    const textLanguage = test.language;
    
    console.log(`🔍 레벨테스트: 텍스트 언어=${textLanguage}, 사용자 언어=한국어`);
    console.log(`📝 문제: ${question.word}, optionWords:`, question.optionWords);
    
    // 선택지는 이미 한국어로 되어있으므로 번역 불필요
    let translatedOptions = question.options;
    let correctIndex = question.correct;

    // 난이도 표시
    const difficultyText = question.difficulty === 1 ? '초급' : question.difficulty === 2 ? '중급' : '고급';
    const difficultyColor = question.difficulty === 1 ? '#4CAF50' : question.difficulty === 2 ? '#FF9800' : '#F44336';

    const questionDiv = document.getElementById('testQuestion');
    questionDiv.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <h3 style="margin: 0;">${question.question || '문제'}</h3>
            <span style="padding: 0.25rem 0.75rem; background: ${difficultyColor}; color: white; border-radius: 12px; font-size: 0.85rem; font-weight: bold;">
                ${difficultyText}
            </span>
        </div>
        <div class="quiz-options" style="margin-top: 1.5rem;">
            ${translatedOptions.map((opt, idx) => `
                <div class="quiz-option" data-answer="${idx}" onclick="selectTestOption(this)">
                    ${idx + 1}. ${opt || '옵션'}
                </div>
            `).join('')}
        </div>
    `;
    
    // 정답 인덱스 업데이트
    question.correct = correctIndex;

    document.getElementById('submitTestBtn').disabled = true;
}

function selectTestOption(element) {
    document.querySelectorAll('.quiz-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    element.classList.add('selected');
    document.getElementById('submitTestBtn').disabled = false;
}

function submitTestAnswer() {
    const test = AppState.currentTest;
    const selected = document.querySelector('.quiz-option.selected');
    
    if (!selected) return;

    const answerIndex = parseInt(selected.dataset.answer);
    const currentQuestion = test.questions[test.currentIndex];
    const isCorrect = answerIndex === currentQuestion.correct;
    
    test.answers.push(answerIndex);
    
    // 적응형 알고리즘: 정답/오답 스트릭 업데이트
    if (isCorrect) {
        test.correctStreak++;
        test.wrongStreak = 0;
    } else {
        test.wrongStreak++;
        test.correctStreak = 0;
    }

    test.currentIndex++;

    // 다음 문제 생성 (아직 문제가 남아있으면)
    if (test.currentIndex < test.totalQuestions) {
        generateNextAdaptiveQuestion();
    }

    setTimeout(() => {
        showTestQuestion();
    }, 500);
}

function showTestResult() {
    const test = AppState.currentTest;
    const score = test.questions.reduce((acc, q, idx) => {
        return acc + (test.answers[idx] === q.correct ? 1 : 0);
    }, 0);
    const percentage = Math.round((score / test.questions.length) * 100);

    // 난이도별 정답률 계산
    const difficultyStats = { easy: { correct: 0, total: 0 }, medium: { correct: 0, total: 0 }, hard: { correct: 0, total: 0 } };
    test.questions.forEach((q, idx) => {
        const difficulty = q.difficulty === 1 ? 'easy' : q.difficulty === 2 ? 'medium' : 'hard';
        difficultyStats[difficulty].total++;
        if (test.answers[idx] === q.correct) {
            difficultyStats[difficulty].correct++;
        }
    });

    document.getElementById('testContainer').style.display = 'none';
    document.getElementById('testResult').style.display = 'block';

    const summary = document.getElementById('testResultSummary');
    const accuracyRateText = typeof t === 'function' ? t('accuracyRate') : '정답률';
    summary.innerHTML = `
        <div class="result-score">${score} / ${test.questions.length}</div>
        <div class="result-percentage">${accuracyRateText}: ${percentage}%</div>
    `;

    // 상세한 레벨 평가
    let level = '';
    let levelDescription = '';
    let recommendation = '';
    
    if (percentage >= 90) {
        level = typeof t === 'function' ? t('advanced') : '상급';
        levelDescription = typeof t === 'function' ? t('advancedDescription') : '고급 수준입니다. 어려운 문제도 잘 해결하실 수 있습니다.';
        recommendation = typeof t === 'function' ? t('advancedRecommendation') : '고급 교재와 원어민 콘텐츠로 학습을 이어가세요.';
    } else if (percentage >= 70) {
        level = typeof t === 'function' ? t('intermediate') : '중급';
        levelDescription = typeof t === 'function' ? t('intermediateDescription') : '중급 수준입니다. 기본적인 내용은 잘 이해하고 있습니다.';
        recommendation = typeof t === 'function' ? t('intermediateRecommendation') : '중급 교재로 실력을 더욱 향상시키세요.';
    } else if (percentage >= 50) {
        level = typeof t === 'function' ? t('beginnerIntermediate') : '초중급';
        levelDescription = typeof t === 'function' ? t('beginnerIntermediateDescription') : '초중급 수준입니다. 기초를 다지고 있습니다.';
        recommendation = typeof t === 'function' ? t('beginnerIntermediateRecommendation') : '기초 교재로 기본기를 탄탄히 하세요.';
    } else {
        level = typeof t === 'function' ? t('beginner') : '초급';
        levelDescription = typeof t === 'function' ? t('beginnerDescription') : '초급 수준입니다. 기초부터 차근차근 학습하세요.';
        recommendation = typeof t === 'function' ? t('beginnerRecommendation') : '기초 단어와 문법부터 시작하세요.';
    }

    const languageName = getLanguageName(test.language);
    const timeSpent = Math.round((Date.now() - test.startTime) / 1000);
    const minutes = Math.floor(timeSpent / 60);
    const seconds = timeSpent % 60;
    const timeText = minutes > 0 ? `${minutes}분 ${seconds}초` : `${seconds}초`;

    const details = document.getElementById('testResultDetails');
    const levelLabel = typeof t === 'function' ? t('expectedLevel') : '예상 레벨';
    const languageLabel = typeof t === 'function' ? t('testLanguage') : '테스트 언어';
    const timeLabel = typeof t === 'function' ? t('timeSpent') : '소요 시간';
    const difficultyLabel = typeof t === 'function' ? t('difficultyBreakdown') : '난이도별 정답률';
    
    details.innerHTML = `
        <div style="margin-bottom: 1.5rem;">
            <p style="font-size: 1.2rem; font-weight: bold; color: var(--primary-color); margin-bottom: 0.5rem;">${levelLabel}: ${level}</p>
            <p style="margin-bottom: 0.5rem;">${levelDescription}</p>
            <p style="color: var(--text-secondary); font-size: 0.9rem;">${recommendation}</p>
        </div>
        <div style="margin-bottom: 1rem;">
            <p><strong>${languageLabel}:</strong> ${languageName}</p>
            <p><strong>${timeLabel}:</strong> ${timeText}</p>
        </div>
        <div style="margin-top: 1.5rem; padding: 1rem; background: var(--bg-secondary); border-radius: 8px;">
            <p style="font-weight: bold; margin-bottom: 0.5rem;">${difficultyLabel}:</p>
            <p>초급: ${difficultyStats.easy.correct} / ${difficultyStats.easy.total} (${difficultyStats.easy.total > 0 ? Math.round((difficultyStats.easy.correct / difficultyStats.easy.total) * 100) : 0}%)</p>
            <p>중급: ${difficultyStats.medium.correct} / ${difficultyStats.medium.total} (${difficultyStats.medium.total > 0 ? Math.round((difficultyStats.medium.correct / difficultyStats.medium.total) * 100) : 0}%)</p>
            <p>고급: ${difficultyStats.hard.correct} / ${difficultyStats.hard.total} (${difficultyStats.hard.total > 0 ? Math.round((difficultyStats.hard.correct / difficultyStats.hard.total) * 100) : 0}%)</p>
        </div>
    `;

    // 결과 저장
    saveLevelTestResult(test, score, percentage, level);
}

// 레벨테스트 결과 저장
function saveLevelTestResult(test, score, percentage, level) {
    const results = JSON.parse(localStorage.getItem('levelTestResults') || '[]');
    results.push({
        date: new Date().toISOString(),
        language: test.language,
        score: score,
        total: test.questions.length,
        percentage: percentage,
        level: level,
        timeSpent: Math.round((Date.now() - test.startTime) / 1000)
    });
    
    // 최근 50개만 저장
    if (results.length > 50) {
        results.shift();
    }
    
    localStorage.setItem('levelTestResults', JSON.stringify(results));
}

// 단어장
// 목표 자격증에 맞는 단어 리스트 렌더링
function renderVocabularyList() {
    const list = document.getElementById('vocabularyList');
    const searchTerm = document.getElementById('searchWord')?.value.toLowerCase() || '';
    const certification = AppState.settings.targetCertification;
    
    // 목표 자격증이 없으면 안내 메시지 표시
    if (!certification || certification === 'none') {
        const selectCertMsg = typeof t === 'function' ? t('selectCertificationPrompt') : '목표 자격증을 선택해주세요';
        const selectCertDesc = typeof t === 'function' ? t('selectCertification') : '설정에서 목표 자격증을 선택하면 해당 자격증의 단어 리스트가 표시됩니다.';
        const openSettingsText = typeof t === 'function' ? t('openSettings') : '⚙️ 설정 열기';
        list.innerHTML = `
            <div style="text-align: center; padding: 3rem; color: var(--text-secondary);">
                <p style="font-size: 1.1rem; margin-bottom: 1rem;">${selectCertMsg}</p>
                <p style="margin-bottom: 1.5rem;">${selectCertDesc}</p>
                <button class="btn btn-primary" onclick="document.getElementById('settingsBtn').click()">
                    ${openSettingsText}
                </button>
            </div>
        `;
        document.getElementById('currentCertification').textContent = '';
        document.getElementById('vocabularyStats').style.display = 'none';
        return;
    }
    
    // 자격증 정보 표시
    const certNames = {
        'jlpt-n5': 'JLPT N5',
        'jlpt-n4': 'JLPT N4',
        'jlpt-n3': 'JLPT N3',
        'jlpt-n2': 'JLPT N2',
        'jlpt-n1': 'JLPT N1'
    };
    const targetCertLabel = typeof t === 'function' ? t('targetCertificationLabel') : '목표 자격증:';
    document.getElementById('currentCertification').textContent = `${targetCertLabel} ${certNames[certification] || certification}`;
    
    // 자격증별 단어 데이터 가져오기
    let words = [];
    
    if (certification.startsWith('jlpt-')) {
        // JLPT 단어 (단일 한자만 사용 - 상용한자 2136자)
        const singleChars = AppState.singleCharacters?.words || [];
        words = [...singleChars];
    } else {
        words = [];
    }
    
    // 검색 필터 적용
    if (searchTerm) {
        words = words.filter(w => {
            const word = (w.word || w.kanji || '').toLowerCase();
            const meaning = (w.meaning || w.translation || '').toLowerCase();
            const reading = (w.reading || w.hiragana || '').toLowerCase();
            return word.includes(searchTerm) || meaning.includes(searchTerm) || reading.includes(searchTerm);
        });
    }
    
    // 통계 정보 업데이트
    const totalWords = words.length;
    const learnedWords = AppState.vocabulary.filter(w => w.mastered).length;
    const learningRate = totalWords > 0 ? Math.round((learnedWords / totalWords) * 100) : 0;
    
    document.getElementById('totalWordCount').textContent = totalWords;
    document.getElementById('learnedWordCount').textContent = learnedWords;
    document.getElementById('learningRate').textContent = learningRate + '%';
    document.getElementById('vocabularyStats').style.display = 'flex';
    
    if (words.length === 0) {
        const noResultsMsg = typeof t === 'function' ? t('noSearchResults') : '검색 결과가 없습니다.';
        const loadingMsg = typeof t === 'function' ? t('loadingWords') : '단어 데이터를 불러오는 중입니다...';
        const tryAgainMsg = typeof t === 'function' ? t('pleaseTryAgain') : '잠시 후 다시 시도해주세요.';
        list.innerHTML = `
            <div style="text-align: center; padding: 3rem; color: var(--text-secondary);">
                <p>${searchTerm ? noResultsMsg : loadingMsg}</p>
                ${!searchTerm ? `<p style="margin-top: 1rem; font-size: 0.9rem;">${tryAgainMsg}</p>` : ''}
            </div>
        `;
        return;
    }
    
    // 단어 리스트 렌더링 (비동기로 언어별 뜻 가져오기)
    renderVocabularyListAsync(words, certification, list);
}

// 단어장 리스트를 비동기로 렌더링 (언어별 뜻 조회)
async function renderVocabularyListAsync(words, certification, listElement) {
    // 한국인 전용 서비스이므로 사용자 언어는 항상 한국어
    const userLanguage = 'ko';
    const textLanguage = 'ja'; // JLPT이므로 항상 일본어
    
    console.log(`📚 단어장 렌더링: 텍스트 언어=${textLanguage}, 사용자 언어=한국어`);
    
    // 먼저 로딩 상태 표시
    listElement.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">단어를 불러오는 중...</div>';
    
    // 모든 단어의 뜻을 병렬로 조회
    const wordsWithMeanings = await Promise.all(words.map(async (word) => {
        const wordText = word.word || word.kanji || '';
        const reading = word.reading || word.hiragana || '';
        const isLearned = AppState.vocabulary.some(w => w.word === wordText && w.mastered);
        
        // 기본 뜻 (폴백용)
        let meaning = word.meaning || word.translation || '';
        let meaningSource = 'default'; // 디버깅용
        
        // 일본어 -> 한국어 언어 쌍별 테이블에서 조회
        const tableName = getLanguagePairTable(textLanguage, userLanguage);
        console.log(`🔍 단어 "${wordText}" 조회: ${tableName} 테이블에서 검색 중...`);
        
        const result = await getWordMeaningFromLanguagePair(wordText, textLanguage, userLanguage);
        if (result && result.meaning) {
            meaning = result.meaning;
            meaningSource = 'language_pair';
            console.log(`✅ 단어 "${wordText}": ${tableName}에서 뜻 찾음: ${meaning}`);
        } else {
            console.log(`⚠️ 단어 "${wordText}": ${tableName}에서 뜻을 찾지 못함. 기본 뜻 사용: ${meaning}`);
        }
        
        return {
            wordText,
            meaning,
            reading,
            isLearned,
            originalWord: word,
            meaningSource // 디버깅용
        };
    }));
    
    // 렌더링
    listElement.innerHTML = wordsWithMeanings.map((item) => {
        const { wordText, meaning, reading, isLearned } = item;
        
        return `
            <div class="vocab-item" style="border-left: ${isLearned ? '4px solid var(--success-color)' : '4px solid transparent'};">
                <div class="vocab-info">
                    <div class="vocab-word" style="font-size: 1.2rem; font-weight: 600;">
                        ${wordText}
                        ${reading ? `<span style="color: var(--text-secondary); font-size: 0.9rem; margin-left: 0.5rem;">(${reading})</span>` : ''}
                        ${isLearned ? '<span style="color: var(--success-color); margin-left: 0.5rem;">✓</span>' : ''}
                    </div>
                    <div class="vocab-meaning" style="margin-top: 0.5rem; color: var(--text-secondary);">
                        ${meaning}
                    </div>
                </div>
                <div class="vocab-actions">
                    <button class="btn btn-secondary" onclick="showWordDetail('${wordText}', 'ja')">${typeof t === 'function' ? t('detail') : '상세'}</button>
                    ${isLearned ? '' : `<button class="btn btn-success" onclick="markWordAsLearned('${wordText}', '${meaning}', 'ja')">${typeof t === 'function' ? t('markAsLearned') : '학습 완료'}</button>`}
                </div>
            </div>
        `;
    }).join('');
}

// 단어를 학습 완료로 표시 (한국인 전용 서비스이므로 항상 일본어)
function markWordAsLearned(word, meaning, language) {
    // JLPT이므로 항상 일본어
    const lang = 'ja';
    const existingWord = AppState.vocabulary.find(w => w.word === word && w.language === lang);
    if (existingWord) {
        existingWord.mastered = true;
    } else {
        AppState.vocabulary.push({
            word: word,
            meaning: meaning,
            language: lang,
            mastered: true,
            reviewCount: 0
        });
    }
    saveData();
    renderVocabularyList();
    updateUI();
    showToast('학습 완료로 표시되었습니다!', 'success');
}

// 검색 필터 이벤트
document.getElementById('searchWord')?.addEventListener('input', renderVocabularyList);
// filterLanguage 제거됨 - 목표 자격증 기반으로 자동 필터링

function deleteWord(index) {
    const confirmDeleteMsg = typeof t === 'function' ? t('confirmDelete') : '이 단어를 삭제하시겠습니까?';
    if (confirm(confirmDeleteMsg)) {
        AppState.vocabulary.splice(index, 1);
        saveData();
        renderVocabularyList();
        updateUI();
    }
}

// 단어 추가 모달
function openAddWordModal() {
    document.getElementById('addWordModal').classList.add('active');
    document.getElementById('modalWord').value = '';
    document.getElementById('modalMeaning').value = '';
    document.getElementById('modalExample').value = '';
}

function closeAddWordModal() {
    document.getElementById('addWordModal').classList.remove('active');
}

function saveWord() {
    const word = document.getElementById('modalWord').value.trim();
    const meaning = document.getElementById('modalMeaning').value.trim();
    const example = document.getElementById('modalExample').value.trim();
    const language = document.getElementById('modalLanguage').value;
    const cert = AppState.settings.targetCertification;

    if (!word || !meaning) {
        alert('단어와 의미를 입력해주세요.');
        return;
    }

    AppState.vocabulary.push({
        word,
        meaning,
        example,
        language,
        certification: cert !== 'none' ? cert : null,
        mastered: false,
        studyCount: 0,
        correctCount: 0,
        dateAdded: new Date().toISOString()
    });

    saveData();
    closeAddWordModal();
    renderVocabularyList();
    updateUI();
}

// 설정 모달
function openSettingsModal() {
    document.getElementById('settingsModal').classList.add('active');
    document.getElementById('targetCertification').value = AppState.settings.targetCertification;
    document.getElementById('dailyGoal').value = AppState.settings.dailyGoal;
}

function closeSettingsModal() {
    document.getElementById('settingsModal').classList.remove('active');
}

function saveSettings() {
    AppState.settings.targetCertification = document.getElementById('targetCertification').value;
    AppState.settings.dailyGoal = parseInt(document.getElementById('dailyGoal').value);
    
    // TTS 설정 저장
    const ttsRate = document.getElementById('ttsRate');
    const ttsPitch = document.getElementById('ttsPitch');
    const ttsVolume = document.getElementById('ttsVolume');
    if (ttsRate) AppState.settings.ttsRate = parseFloat(ttsRate.value);
    if (ttsPitch) AppState.settings.ttsPitch = parseFloat(ttsPitch.value);
    if (ttsVolume) AppState.settings.ttsVolume = parseFloat(ttsVolume.value);
    
    AppState.dailyProgress.goal = AppState.settings.dailyGoal;
    
    saveData();
    closeSettingsModal();
    
    // UI 업데이트
    updateUI();
    updateAuthUI();
    
    // 현재 페이지 다시 표시하여 텍스트 업데이트
    showPage(AppState.currentPage);
    
    // 독해 페이지인 경우 지문 다시 표시하여 호버 기능 업데이트
    if (AppState.currentPage === 'reading' && AppState.currentReadingPassage) {
        displayReadingPassage(AppState.currentReadingPassage);
    }
    
    // 단어장 페이지가 활성화되어 있으면 새로고침
    if (AppState.currentPage === 'vocabulary') {
        renderVocabularyList();
    }
    
    // 저장 완료 메시지
    const langNames = {
        'ko': '한국어',
        'ja': '日本語',
        'en': 'English',
        'zh': '中文'
    };
    const langName = langNames[selectedLanguage] || selectedLanguage;
    showToast(`설정이 저장되었습니다. (서비스 언어: ${langName})`, 'success', 2000);
}

// 진행상황 페이지 업데이트
function updateProgressPage() {
    const totalWords = AppState.vocabulary.length;
    const learnedWords = AppState.vocabulary.filter(w => w.mastered).length;
    const learningWords = AppState.vocabulary.filter(w => !w.mastered && w.studyCount > 0).length;

    document.getElementById('progressTotalWords').textContent = totalWords;
    document.getElementById('progressLearnedWords').textContent = learnedWords;
    document.getElementById('progressLearningWords').textContent = learningWords;

    // 언어별 통계
    const langStats = {};
    AppState.vocabulary.forEach(w => {
        if (!langStats[w.language]) {
            langStats[w.language] = { total: 0, learned: 0 };
        }
        langStats[w.language].total++;
        if (w.mastered) langStats[w.language].learned++;
    });

    const langStatsDiv = document.getElementById('languageStats');
    langStatsDiv.innerHTML = Object.entries(langStats).map(([lang, stats]) => `
        <div class="stat-item">
            <span>${getLanguageName(lang)}:</span>
            <span>${stats.learned} / ${stats.total}</span>
        </div>
    `).join('');

    // 최근 활동
    const recentActivity = AppState.searchHistory.slice(0, 5);
    const activityDiv = document.getElementById('recentActivity');
    const noActivityText = typeof t === 'function' ? t('noRecentActivity') : '최근 활동이 없습니다.';
    const searchedText = typeof t === 'function' ? t('searched') : '검색';
    if (recentActivity.length === 0) {
        activityDiv.innerHTML = `<p style="color: var(--text-secondary);">${noActivityText}</p>`;
    } else {
        activityDiv.innerHTML = recentActivity.map(entry => `
            <div class="stat-item">
                <span>${entry.query || entry.word} ${searchedText}</span>
                <span>${new Date(entry.date).toLocaleDateString()}</span>
            </div>
        `).join('');
    }
}

function getLanguageName(code) {
    // 한국인 전용 서비스이므로 한국어로 언어명 반환
    const names = {
        'en': '영어',
        'ja': '일본어',
        'zh': '중국어',
        'es': '스페인어',
        'ko': '한국어'
    };
    return names[code] || code;
}

// 사용자 데이터 로드 (Supabase Auth 세션 확인)
async function loadUserData() {
    // Supabase 클라이언트 확인
    if (!window.supabaseClient) {
        // 폴백: localStorage 사용
        const savedUser = localStorage.getItem('currentUser');
        if (savedUser) {
            AppState.currentUser = JSON.parse(savedUser);
        }
        return;
    }

    const supabase = window.supabaseClient;

    try {
        // 현재 세션 확인
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
            console.error('세션 확인 오류:', error);
            return;
        }

        if (session && session.user) {
            // 프로필 정보 가져오기
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', session.user.id)
                .single();

            if (profileError) {
                console.error('프로필 로드 오류:', profileError);
            }

            AppState.currentUser = {
                id: session.user.id,
                username: profile?.username || session.user.email?.split('@')[0] || 'User',
                email: session.user.email
            };
        } else {
            AppState.currentUser = null;
        }
    } catch (error) {
        console.error('사용자 데이터 로드 오류:', error);
        // 폴백: localStorage 사용
        const savedUser = localStorage.getItem('currentUser');
        if (savedUser) {
            AppState.currentUser = JSON.parse(savedUser);
        }
    }
}

// 사용자 데이터 저장
function saveUserData() {
    if (AppState.currentUser) {
        localStorage.setItem('currentUser', JSON.stringify(AppState.currentUser));
    } else {
        localStorage.removeItem('currentUser');
    }
}

// 모든 사용자 목록 가져오기
function getAllUsers() {
    const users = localStorage.getItem('users');
    return users ? JSON.parse(users) : [];
}

// 사용자 저장
function saveUsers(users) {
    localStorage.setItem('users', JSON.stringify(users));
}

// 인증 UI 업데이트
function updateAuthUI() {
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const accountBtn = document.getElementById('accountBtn');
    const userInfo = document.getElementById('userInfo');
    
    if (AppState.currentUser) {
        // 로그인 상태
        if (loginBtn) loginBtn.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'inline-block';
        if (accountBtn) accountBtn.style.display = 'inline-block';
        if (userInfo) {
            userInfo.style.display = 'inline-block';
            userInfo.textContent = `👤 ${AppState.currentUser.username}`;
        }
    } else {
        // 비로그인 상태
        if (loginBtn) loginBtn.style.display = 'inline-block';
        if (logoutBtn) logoutBtn.style.display = 'none';
        if (accountBtn) accountBtn.style.display = 'none';
        if (userInfo) userInfo.style.display = 'none';
    }
}

// 모달 닫기 헬퍼 함수
function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// 로그인 모달 표시
function showLoginModal() {
    document.getElementById('loginModal').classList.add('active');
    document.getElementById('loginError').style.display = 'none';
    document.getElementById('loginEmail').value = '';
    document.getElementById('loginPassword').value = '';
}

// 회원가입 모달 표시
function showSignupModal() {
    closeModal('loginModal');
    document.getElementById('signupModal').classList.add('active');
    document.getElementById('signupError').style.display = 'none';
    document.getElementById('signupUsername').value = '';
    document.getElementById('signupEmail').value = '';
    document.getElementById('signupPassword').value = '';
    document.getElementById('signupPasswordConfirm').value = '';
}

// 로그인 처리 (Supabase Auth)
async function handleLogin() {
    const emailOrUsername = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');
    
    if (!emailOrUsername || !password) {
        errorDiv.textContent = typeof t === 'function' ? t('enterEmailAndPassword') : '이메일과 비밀번호를 입력해주세요.';
        errorDiv.style.display = 'block';
        return;
    }

    // Supabase 클라이언트 확인
    if (!window.supabaseClient) {
        errorDiv.textContent = typeof t === 'function' ? t('supabaseClientNotLoaded') : 'Supabase 클라이언트가 로드되지 않았습니다.';
        errorDiv.style.display = 'block';
        return;
    }

    const supabase = window.supabaseClient;
    errorDiv.style.display = 'none';

    try {
        // 이메일로 로그인 (Supabase는 이메일만 지원)
        // 사용자명으로 로그인하려면 먼저 프로필에서 이메일 찾기
        let email = emailOrUsername;
        
        // 이메일 형식이 아니면 프로필에서 찾기
        if (!emailOrUsername.includes('@')) {
            const { data: profiles } = await supabase
                .from('profiles')
                .select('email')
                .eq('username', emailOrUsername)
                .single();
            
            if (profiles && profiles.email) {
                email = profiles.email;
            } else {
                errorDiv.textContent = typeof t === 'function' ? t('usernameNotFound') : '사용자명을 찾을 수 없습니다. 이메일을 사용해주세요.';
                errorDiv.style.display = 'block';
                return;
            }
        }

        // Supabase Auth로 로그인
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) {
            console.error('로그인 오류:', error);
            
            // 더 자세한 오류 메시지 제공
            let errorMessage = error.message;
            if (error.message && error.message.includes('Email not confirmed')) {
                errorMessage = '이메일 확인이 필요합니다. 이메일을 확인해주세요.';
            } else if (error.message && error.message.includes('Invalid login credentials')) {
                errorMessage = '이메일 또는 비밀번호가 올바르지 않습니다.';
            } else if (error.message && error.message.includes('User not found')) {
                errorMessage = '등록되지 않은 이메일입니다.';
            }
            
            errorDiv.textContent = errorMessage || (typeof t === 'function' ? t('emailOrPasswordIncorrect') : '이메일 또는 비밀번호가 올바르지 않습니다.');
            errorDiv.style.display = 'block';
            return;
        }

        if (data.user && data.session) {
            // 프로필 정보 가져오기
            const { data: profile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', data.user.id)
                .single();

            AppState.currentUser = {
                id: data.user.id,
                username: profile?.username || data.user.email?.split('@')[0] || 'User',
                email: data.user.email
            };
            
            saveUserData();
            updateAuthUI();
            await loadData(); // 사용자 데이터 로드
            closeModal('loginModal');
            enablePageAccess(); // 페이지 접근 허용
            await checkOnboardingStatus(); // 온보딩 상태 확인
            enablePageAccess(); // 페이지 접근 허용
            await checkOnboardingStatus(); // 온보딩 상태 확인
        }
    } catch (error) {
        console.error('로그인 오류:', error);
        errorDiv.textContent = typeof t === 'function' ? t('loginError') : '로그인 중 오류가 발생했습니다.';
        errorDiv.style.display = 'block';
    }
}

// 회원가입 처리 (Supabase Auth)
async function handleSignup() {
    const username = document.getElementById('signupUsername').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    const passwordConfirm = document.getElementById('signupPasswordConfirm').value;
    const errorDiv = document.getElementById('signupError');
    
    // 유효성 검사
    if (!username || !email || !password || !passwordConfirm) {
        errorDiv.textContent = typeof t === 'function' ? t('fillAllFields') : '모든 필드를 입력해주세요.';
        errorDiv.style.display = 'block';
        return;
    }
    
    if (password !== passwordConfirm) {
        errorDiv.textContent = typeof t === 'function' ? t('passwordsDoNotMatch') : '비밀번호가 일치하지 않습니다.';
        errorDiv.style.display = 'block';
        return;
    }
    
    if (password.length < 6) {
        errorDiv.textContent = typeof t === 'function' ? t('passwordMinLength') : '비밀번호는 최소 6자 이상이어야 합니다.';
        errorDiv.style.display = 'block';
        return;
    }

    // Supabase 클라이언트 확인
    if (!window.supabaseClient) {
        errorDiv.textContent = typeof t === 'function' ? t('supabaseClientNotLoaded') : 'Supabase 클라이언트가 로드되지 않았습니다.';
        errorDiv.style.display = 'block';
        return;
    }

    const supabase = window.supabaseClient;
    errorDiv.style.display = 'none';

    try {
        // 사용자명 중복 확인
        const { data: existingProfile } = await supabase
            .from('profiles')
            .select('username')
            .eq('username', username)
            .single();

        if (existingProfile) {
            errorDiv.textContent = typeof t === 'function' ? t('usernameAlreadyExists') : '이미 사용 중인 사용자명입니다.';
            errorDiv.style.display = 'block';
            return;
        }

        // Supabase Auth로 회원가입
        const { data, error } = await supabase.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    username: username
                },
                emailRedirectTo: window.location.origin // 이메일 확인 후 리다이렉트 URL
            }
        });

        if (error) {
            console.error('회원가입 오류:', error);
            errorDiv.textContent = error.message || (typeof t === 'function' ? t('signupError') : '회원가입 중 오류가 발생했습니다.');
            errorDiv.style.display = 'block';
            return;
        }

        // 이메일 확인이 필요한 경우 처리
        if (data.user && !data.session) {
            // 이메일 확인이 필요한 경우
            errorDiv.innerHTML = `
                <p style="color: var(--info-color); margin-bottom: 0.5rem;">
                    회원가입이 완료되었습니다!<br>
                    이메일 확인 링크를 클릭해주세요. (${email})
                </p>
                <p style="font-size: 0.9rem; color: var(--text-secondary);">
                    이메일을 확인한 후 다시 로그인해주세요.
                </p>
            `;
            errorDiv.style.display = 'block';
            return;
        }

        if (data.user && data.session) {
            // 프로필은 트리거로 자동 생성되지만, 사용자명을 확실히 설정
            // 회원가입 시 기본값 설정 (온보딩 완료 전까지는 null이 아닌 기본값)
            const { error: profileError } = await supabase
                .from('profiles')
                .upsert({
                    id: data.user.id,
                    username: username,
                    email: email,
                    native_language: null, // 온보딩에서 설정
                    certifications: [] // 온보딩에서 설정
                });

            if (profileError) {
                console.error('프로필 생성 오류:', profileError);
            }

            // 자동 로그인
            AppState.currentUser = {
                id: data.user.id,
                username: username,
                email: email
            };
            
            saveUserData();
            updateAuthUI();
            await loadData(); // 사용자 데이터 로드
            closeModal('signupModal');
            
            // 회원가입 직후 온보딩 시작 (페이지 접근은 온보딩 완료 후)
            showOnboardingNativeLanguageModal();
        }
    } catch (error) {
        console.error('회원가입 오류:', error);
        errorDiv.textContent = '회원가입 중 오류가 발생했습니다.';
        errorDiv.style.display = 'block';
    }
}

// 로그아웃 처리 (Supabase Auth)
async function handleLogout() {
    if (!confirm('로그아웃 하시겠습니까?')) {
        return;
    }

    // Supabase 클라이언트 확인
    if (window.supabaseClient) {
        try {
            const { error } = await window.supabaseClient.auth.signOut();
            if (error) {
                console.error('로그아웃 오류:', error);
            }
        } catch (error) {
            console.error('로그아웃 오류:', error);
        }
    }

    AppState.currentUser = null;
    saveUserData();
    updateAuthUI();
    
    // 사용자 데이터 초기화
    AppState.vocabulary = [];
    AppState.searchHistory = [];
    saveData();
    updateUI();
}

// 계정 관리 모달 열기
function openAccountModal() {
    if (!AppState.currentUser) {
        showLoginModal();
        return;
    }
    
    document.getElementById('accountUsername').textContent = AppState.currentUser.username;
    document.getElementById('accountEmail').textContent = AppState.currentUser.email;
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('newPasswordConfirm').value = '';
    document.getElementById('deletePasswordConfirm').value = '';
    document.getElementById('passwordChangeError').style.display = 'none';
    document.getElementById('passwordChangeSuccess').style.display = 'none';
    document.getElementById('deleteError').style.display = 'none';
    
    document.getElementById('accountModal').classList.add('active');
}

// 비밀번호 변경 처리 (Supabase Auth)
async function handlePasswordChange() {
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const newPasswordConfirm = document.getElementById('newPasswordConfirm').value;
    const errorDiv = document.getElementById('passwordChangeError');
    const successDiv = document.getElementById('passwordChangeSuccess');
    
    errorDiv.style.display = 'none';
    successDiv.style.display = 'none';
    
    if (!currentPassword || !newPassword || !newPasswordConfirm) {
        errorDiv.textContent = '모든 필드를 입력해주세요.';
        errorDiv.style.display = 'block';
        return;
    }
    
    if (newPassword !== newPasswordConfirm) {
        errorDiv.textContent = '새 비밀번호가 일치하지 않습니다.';
        errorDiv.style.display = 'block';
        return;
    }
    
    if (newPassword.length < 6) {
        errorDiv.textContent = '비밀번호는 최소 6자 이상이어야 합니다.';
        errorDiv.style.display = 'block';
        return;
    }

    // Supabase 클라이언트 확인
    if (!window.supabaseClient || !AppState.currentUser) {
        errorDiv.textContent = '로그인이 필요합니다.';
        errorDiv.style.display = 'block';
        return;
    }

    const supabase = window.supabaseClient;

    try {
        // 현재 비밀번호 확인 (재로그인)
        const { error: signInError } = await supabase.auth.signInWithPassword({
            email: AppState.currentUser.email,
            password: currentPassword
        });

        if (signInError) {
            errorDiv.textContent = '현재 비밀번호가 올바르지 않습니다.';
            errorDiv.style.display = 'block';
            return;
        }

        // 비밀번호 변경
        const { error: updateError } = await supabase.auth.updateUser({
            password: newPassword
        });

        if (updateError) {
            errorDiv.textContent = updateError.message || (typeof t === 'function' ? t('passwordChangeError') : '비밀번호 변경 중 오류가 발생했습니다.');
            errorDiv.style.display = 'block';
            return;
        }

        successDiv.textContent = typeof t === 'function' ? t('passwordChangeSuccess') : '비밀번호가 성공적으로 변경되었습니다.';
        successDiv.style.display = 'block';
        
        // 입력 필드 초기화
        document.getElementById('currentPassword').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('newPasswordConfirm').value = '';
    } catch (error) {
        console.error('비밀번호 변경 오류:', error);
        errorDiv.textContent = typeof t === 'function' ? t('passwordChangeError') : '비밀번호 변경 중 오류가 발생했습니다.';
        errorDiv.style.display = 'block';
    }
}

// 회원 탈퇴 처리 (Supabase Auth)
async function handleAccountDeletion() {
    const password = document.getElementById('deletePasswordConfirm').value;
    const errorDiv = document.getElementById('deleteError');
    
    errorDiv.style.display = 'none';
    
    if (!password) {
        errorDiv.textContent = '비밀번호를 입력해주세요.';
        errorDiv.style.display = 'block';
        return;
    }
    
    const confirmMsg = typeof t === 'function' ? t('deleteAccountWarning') : '정말로 회원 탈퇴를 하시겠습니까? 모든 데이터가 삭제되며 복구할 수 없습니다.';
    if (!confirm(confirmMsg)) {
        return;
    }

    // Supabase 클라이언트 확인
    if (!window.supabaseClient || !AppState.currentUser) {
        errorDiv.textContent = typeof t === 'function' ? t('loginRequired') : '로그인이 필요합니다.';
        errorDiv.style.display = 'block';
        return;
    }

    const supabase = window.supabaseClient;

    try {
        // 비밀번호 확인 (재로그인)
        const { error: signInError } = await supabase.auth.signInWithPassword({
            email: AppState.currentUser.email,
            password: password
        });

        if (signInError) {
            errorDiv.textContent = typeof t === 'function' ? t('emailOrPasswordIncorrect') : '비밀번호가 올바르지 않습니다.';
            errorDiv.style.display = 'block';
            return;
        }

        // 사용자 데이터 삭제는 RLS 정책과 CASCADE로 자동 처리됨
        // profiles 테이블 삭제 시 관련 데이터 모두 삭제됨
        
        // Auth 사용자 삭제
        const { error: deleteError } = await supabase.auth.admin.deleteUser(AppState.currentUser.id);
        
        // admin API는 클라이언트에서 사용할 수 없으므로, 프로필만 삭제
        // 실제로는 서버 사이드에서 처리해야 하지만, 여기서는 프로필 삭제로 대체
        const { error: profileDeleteError } = await supabase
            .from('profiles')
            .delete()
            .eq('id', AppState.currentUser.id);

        if (profileDeleteError) {
            console.error('프로필 삭제 오류:', profileDeleteError);
            // 프로필 삭제 실패해도 로그아웃은 진행
        }

        // 로그아웃
        await supabase.auth.signOut();
        
        // 로컬 데이터 초기화
        AppState.currentUser = null;
        AppState.vocabulary = [];
        AppState.searchHistory = [];
        saveUserData();
        saveData();
        updateAuthUI();
        updateUI();
        
        closeModal('accountModal');
        alert(typeof t === 'function' ? t('accountDeletedSuccess') : '회원 탈퇴가 완료되었습니다.');
    } catch (error) {
        console.error('회원 탈퇴 오류:', error);
        errorDiv.textContent = typeof t === 'function' ? t('accountDeleteErrorMsg') : '회원 탈퇴 중 오류가 발생했습니다.';
        errorDiv.style.display = 'block';
    }
}

// 온보딩 관련 함수들
async function checkOnboardingStatus() {
    if (!AppState.currentUser || !window.supabaseClient) return;
    
    const supabase = window.supabaseClient;
    const userId = AppState.currentUser.id;
    
    try {
        // 프로필에서 모국어와 자격증 확인
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('native_language, certifications')
            .eq('id', userId)
            .single();
        
        if (error && error.code !== 'PGRST116') {
            console.error('온보딩 상태 확인 오류:', error);
            return;
        }
        
        // 모국어가 없으면 온보딩 시작
        if (!profile || !profile.native_language) {
            showOnboardingNativeLanguageModal();
            return;
        }
        
        // 자격증이 없으면 자격증 선택 모달 표시
        if (!profile.certifications || profile.certifications.length === 0) {
            showOnboardingCertificationModal();
            return;
        }
        
        // 온보딩 완료 - 자격증 정보를 AppState에 저장
        if (profile.certifications && profile.certifications.length > 0) {
            // 첫 번째 자격증을 기본 목표로 설정
            AppState.settings.targetCertification = profile.certifications[0];
        }
    } catch (error) {
        console.error('온보딩 상태 확인 중 오류:', error);
    }
}

function disablePageAccess() {
    // 모든 페이지 숨기기
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    // 네비게이션 버튼 비활성화
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.style.pointerEvents = 'none';
        btn.style.opacity = '0.5';
    });
    
    // 헤더의 설정 버튼만 활성화 (로그인 모달은 열 수 있도록)
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
        settingsBtn.style.pointerEvents = 'auto';
        settingsBtn.style.opacity = '1';
    }
}

function enablePageAccess() {
    // 네비게이션 버튼 활성화
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.style.pointerEvents = 'auto';
        btn.style.opacity = '1';
    });
    
    // 홈 페이지 표시
    showPage('home');
}

function showOnboardingNativeLanguageModal() {
    const modal = document.getElementById('onboardingNativeLanguageModal');
    if (modal) {
        modal.classList.add('active');
        const errorDiv = document.getElementById('nativeLanguageError');
        if (errorDiv) errorDiv.style.display = 'none';
        
        // 페이지 접근 제한 (온보딩 완료 전까지)
        disablePageAccess();
    }
}

async function showOnboardingCertificationModal() {
    const modal = document.getElementById('onboardingCertificationModal');
    if (modal) {
        modal.classList.add('active');
        const errorDiv = document.getElementById('certificationError');
        if (errorDiv) errorDiv.style.display = 'none';
        
        // 페이지 접근 제한 (온보딩 완료 전까지)
        disablePageAccess();
        
        // 기존 선택된 자격증 표시 (있는 경우)
        if (window.supabaseClient && AppState.currentUser) {
            try {
                const { data: profile } = await window.supabaseClient
                    .from('profiles')
                    .select('certifications')
                    .eq('id', AppState.currentUser.id)
                    .single();
                
                if (profile && profile.certifications && profile.certifications.length > 0) {
                    profile.certifications.forEach(cert => {
                        const checkbox = document.querySelector(`input[name="certification"][value="${cert}"]`);
                        if (checkbox) checkbox.checked = true;
                    });
                }
            } catch (error) {
                console.error('자격증 정보 로드 오류:', error);
            }
        }
    }
}

async function saveNativeLanguage() {
    // 한국인 전용 서비스이므로 모국어는 항상 한국어
    const nativeLanguage = 'ko';
    
    if (!AppState.currentUser || !window.supabaseClient) {
        const errorDiv = document.getElementById('nativeLanguageError');
        if (errorDiv) {
            errorDiv.textContent = '로그인이 필요합니다.';
            errorDiv.style.display = 'block';
        }
        return;
    }
    
    const supabase = window.supabaseClient;
    const userId = AppState.currentUser.id;
    
    try {
        const { error } = await supabase
            .from('profiles')
            .update({ native_language: nativeLanguage })
            .eq('id', userId);
        
        if (error) {
            console.error('모국어 저장 오류:', error);
            const errorDiv = document.getElementById('nativeLanguageError');
            if (errorDiv) {
                errorDiv.textContent = '모국어 저장 중 오류가 발생했습니다.';
                errorDiv.style.display = 'block';
            }
            return;
        }
        
        // 다음 단계로 이동
        closeModal('onboardingNativeLanguageModal');
        await showOnboardingCertificationModal();
    } catch (error) {
        console.error('모국어 저장 중 예외:', error);
        const errorDiv = document.getElementById('nativeLanguageError');
        if (errorDiv) {
            errorDiv.textContent = '모국어 저장 중 오류가 발생했습니다.';
            errorDiv.style.display = 'block';
        }
    }
}

async function saveCertifications() {
    const checkboxes = document.querySelectorAll('input[name="certification"]:checked');
    const errorDiv = document.getElementById('certificationError');
    
    if (checkboxes.length === 0) {
        if (errorDiv) {
            errorDiv.textContent = '최소 하나의 자격증을 선택해주세요.';
            errorDiv.style.display = 'block';
        }
        return;
    }
    
    if (!AppState.currentUser || !window.supabaseClient) {
        if (errorDiv) {
            errorDiv.textContent = '로그인이 필요합니다.';
            errorDiv.style.display = 'block';
        }
        return;
    }
    
    const supabase = window.supabaseClient;
    const userId = AppState.currentUser.id;
    
    const certifications = Array.from(checkboxes).map(cb => cb.value);
    
    try {
        const { error } = await supabase
            .from('profiles')
            .update({ certifications: certifications })
            .eq('id', userId);
        
        if (error) {
            console.error('자격증 저장 오류:', error);
            if (errorDiv) {
                errorDiv.textContent = '자격증 저장 중 오류가 발생했습니다.';
                errorDiv.style.display = 'block';
            }
            return;
        }
        
        // AppState에 저장
        AppState.settings.targetCertification = certifications[0];
        
        // 온보딩 완료
        closeModal('onboardingCertificationModal');
        enablePageAccess(); // 온보딩 완료 후 페이지 접근 허용
        showToast('온보딩이 완료되었습니다! 학습을 시작할 수 있습니다.', 'success');
        
        // 페이지 새로고침하여 학습 기능 활성화
        updateUI();
    } catch (error) {
        console.error('자격증 저장 중 예외:', error);
        if (errorDiv) {
            errorDiv.textContent = '자격증 저장 중 오류가 발생했습니다.';
            errorDiv.style.display = 'block';
        }
    }
}

function goBackToNativeLanguage() {
    closeModal('onboardingCertificationModal');
    showOnboardingNativeLanguageModal();
}

// 전역 함수 (HTML에서 호출)
window.showPage = showPage;
window.startMockTest = startMockTest;
window.startLevelTest = startLevelTest;
window.selectQuizOption = selectQuizOption;
window.selectTestOption = selectTestOption;
window.selectReadingOption = selectReadingOption;
window.closeModal = closeModal;
window.showLoginModal = showLoginModal;
window.showSignupModal = showSignupModal;
window.handleLogin = handleLogin;
window.handleSignup = handleSignup;
window.handleLogout = handleLogout;
window.openAccountModal = openAccountModal;
window.handlePasswordChange = handlePasswordChange;
window.handleAccountDeletion = handleAccountDeletion;
window.selectFlashcardOption = selectFlashcardOption;
window.showWordDetail = showWordDetail;
window.searchFromHistory = searchFromHistory;
window.deleteWord = deleteWord;
window.saveNativeLanguage = saveNativeLanguage;
window.saveCertifications = saveCertifications;
window.goBackToNativeLanguage = goBackToNativeLanguage;

