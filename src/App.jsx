import React, { useState, useEffect, useRef } from 'react';
import {
  getBaaSConfig,
  saveBaaSConfig,
  getCurrentUser,
  registerPlayer,
  loginPlayer,
  logoutPlayer,
  fetchQuizQuestions,
  seedQuestionsToBack4App,
  fetchLeaderboard,
  submitMatchScore,
  joinOrCreateMultiplayerRoom,
  updateMultiplayerProgress,
  subscribeRealtimeUpdates,
  subscribeBaaSTelemetry,
} from './services/back4app';
import {
  calculateQuestionScore,
  evaluateMatchResult,
  buildBack4AppScorePayload,
  GAME_CONFIG,
} from './utils/gameRules';

export default function App() {
  const [user, setUser] = useState(() => getCurrentUser());
  const [baasConfig, setBaasConfig] = useState(() => getBaaSConfig());
  const [showConfigModal, setShowConfigModal] = useState(false);

  // Auth form state
  const [authTab, setAuthTab] = useState('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Lobby & Multiplayer state
  const [screen, setScreen] = useState(() => (getCurrentUser() ? 'LOBBY' : 'AUTH'));
  const [roomCode, setRoomCode] = useState('UNIFOR-01');
  const [roomFilter, setRoomFilter] = useState('ALL');
  const [roomState, setRoomState] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [telemetry, setTelemetry] = useState([]);

  // Gameplay state
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(GAME_CONFIG.MAX_TIME_SECONDS);
  const [selectedOption, setSelectedOption] = useState(null);
  const [lastPointsBreakdown, setLastPointsBreakdown] = useState(null);
  const [score, setScore] = useState(0);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [lastSavedPayload, setLastSavedPayload] = useState(null);

  // Config Modal inputs
  const [cfgAppId, setCfgAppId] = useState(baasConfig.appId);
  const [cfgJsKey, setCfgJsKey] = useState(baasConfig.jsKey);
  const [cfgLiveQuery, setCfgLiveQuery] = useState(baasConfig.liveQueryUrl);
  const [seedMessage, setSeedMessage] = useState('');

  const timerRef = useRef(null);

  // Subscribe to BaaS Telemetry logs
  useEffect(() => {
    return subscribeBaaSTelemetry(setTelemetry);
  }, []);

  // Load initial Leaderboard & Questions
  useEffect(() => {
    loadLeaderboardData(roomFilter);
  }, [roomFilter, baasConfig.isCloudConfigured]);

  // Subscribe to Realtime LiveQuery / Broadcast updates
  useEffect(() => {
    const unsubscribe = subscribeRealtimeUpdates({
      roomCode,
      onRoomUpdate: (updatedRoom) => {
        setRoomState(updatedRoom);
      },
      onScoreCreated: () => {
        loadLeaderboardData(roomFilter);
      },
    });
    return unsubscribe;
  }, [roomCode, roomFilter, baasConfig.isCloudConfigured]);

  async function loadLeaderboardData(filter) {
    const data = await fetchLeaderboard(filter);
    setLeaderboard(data);
  }

  // Question countdown timer during QUIZ screen
  useEffect(() => {
    if (screen !== 'QUIZ' || selectedOption !== null) {
      return;
    }

    timerRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          handleSelectAnswer(-1, 0); // Tempo esgotado
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [screen, currentIndex, selectedOption]);

  async function handleAuthSubmit(e) {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      let loggedUser;
      if (authTab === 'register') {
        loggedUser = await registerPlayer({ username, email, password });
      } else {
        loggedUser = await loginPlayer({ username, password });
      }
      setUser(loggedUser);
      setScreen('LOBBY');
      loadLeaderboardData(roomFilter);
    } catch (err) {
      setAuthError(err.message || 'Falha na autenticação com o BaaS.');
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleQuickDemoLogin(demoName) {
    setAuthError('');
    setAuthLoading(true);
    try {
      const loggedUser = await loginPlayer({
        username: demoName,
        password: 'demo_cloud_password',
      });
      setUser(loggedUser);
      setScreen('LOBBY');
      loadLeaderboardData(roomFilter);
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    await logoutPlayer();
    setUser(null);
    setScreen('AUTH');
  }

  async function handleStartMatch() {
    const loadedQuestions = await fetchQuizQuestions();
    const activeRoom = await joinOrCreateMultiplayerRoom({
      user,
      roomCode,
    });
    setRoomState(activeRoom);
    setQuestions(loadedQuestions);
    setCurrentIndex(0);
    setScore(0);
    setCorrectAnswers(0);
    setStreak(0);
    setMaxStreak(0);
    setSelectedOption(null);
    setLastPointsBreakdown(null);
    setTimeRemaining(GAME_CONFIG.MAX_TIME_SECONDS);
    setScreen('QUIZ');
  }

  async function handleSelectAnswer(optionIndex, customTimeLeft = timeRemaining) {
    if (selectedOption !== null) return;
    clearInterval(timerRef.current);

    const currentQ = questions[currentIndex];
    const isCorrect = optionIndex === currentQ.correctIndex;

    const pointsResult = calculateQuestionScore({
      isCorrect,
      difficulty: currentQ.difficulty,
      timeRemaining: customTimeLeft,
      currentStreak: streak,
    });

    const updatedScore = score + pointsResult.totalPoints;
    const updatedCorrect = isCorrect ? correctAnswers + 1 : correctAnswers;
    const updatedMaxStreak = Math.max(maxStreak, pointsResult.newStreak);

    setSelectedOption(optionIndex);
    setLastPointsBreakdown(pointsResult);
    setScore(updatedScore);
    setCorrectAnswers(updatedCorrect);
    setStreak(pointsResult.newStreak);
    setMaxStreak(updatedMaxStreak);

    // Sincroniza estado em tempo real na Sala Multiplayer (Recurso BaaS #4)
    const updatedRoom = await updateMultiplayerProgress({
      user,
      roomCode,
      roomObjectId: roomState?.objectId,
      score: updatedScore,
      currentQuestion: currentIndex + 1,
      correctAnswers: updatedCorrect,
      status: currentIndex + 1 >= questions.length ? 'FINISHED' : 'PLAYING',
    });
    setRoomState(updatedRoom);
  }

  async function handleNextQuestion() {
    if (currentIndex + 1 < questions.length) {
      setCurrentIndex((prev) => prev + 1);
      setSelectedOption(null);
      setLastPointsBreakdown(null);
      setTimeRemaining(GAME_CONFIG.MAX_TIME_SECONDS);
    } else {
      // Fim da partida -> envia pontuação ao Back4App com ACL e Cloud Code
      const previewPayload = buildBack4AppScorePayload({
        userId: user.objectId,
        username: user.username,
        score,
        correctAnswers,
        totalQuestions: questions.length,
        maxStreak,
        roomCode,
      });
      setLastSavedPayload(previewPayload);

      await submitMatchScore({
        user,
        score,
        correctAnswers,
        totalQuestions: questions.length,
        maxStreak,
        roomCode,
      });
      await loadLeaderboardData(roomFilter);
      setScreen('RESULT');
    }
  }

  function handleSaveConfig(e) {
    e.preventDefault();
    saveBaaSConfig({
      appId: cfgAppId,
      jsKey: cfgJsKey,
      liveQueryUrl: cfgLiveQuery,
      serverUrl: 'https://parseapi.back4app.com',
    });
    setBaasConfig(getBaaSConfig());
    setShowConfigModal(false);
  }

  async function handleSeedCloudQuestions() {
    setSeedMessage('Enviando questões para a classe Question no Back4App...');
    try {
      const count = await seedQuestionsToBack4App(user?.sessionToken);
      setSeedMessage(`Sucesso! ${count} questões criadas na nuvem Back4App.`);
    } catch (err) {
      setSeedMessage(`Aviso: ${err.message}`);
    }
  }

  // Encontra oponente na sala multiplayer (se houver outro jogador conectado)
  const roomPlayers = Object.values(roomState?.players || {});
  const opponents = roomPlayers.filter((p) => p.userId !== user?.objectId);
  const topOpponentScore =
    opponents.length > 0 ? Math.max(...opponents.map((o) => o.score || 0)) : null;

  const matchEvaluation = evaluateMatchResult({
    score,
    correctAnswers,
    totalQuestions: questions.length || 6,
    opponentScore: topOpponentScore,
  });

  const currentQuestion = questions[currentIndex];

  return (
    <div className="app-shell">
      {/* HEADER / TOPBAR */}
      <header className="topbar">
        <div className="brand-group">
          <div className="brand-logo">☁️</div>
          <div>
            <div className="brand-title">
              CloudQuiz Arena
              <span className="version-pill">v1.0 • Vite + Docker OCI</span>
            </div>
            <div className="brand-subtitle">
              Multiplayer Sincronizado com Back4App (BaaS) &amp; CI/CD GitHub Actions — UNIFOR
            </div>
          </div>
        </div>

        <div className="topbar-actions">
          <div className="status-badge">
            <span
              className={`status-dot ${baasConfig.isCloudConfigured ? 'online' : 'emulator'}`}
            />
            {baasConfig.isCloudConfigured
              ? 'Back4App Cloud Ativo'
              : 'BaaS Sync Multi-Aba Ativo'}
          </div>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setShowConfigModal(true)}
          >
            ⚙️ Configurar Back4App
          </button>

          {user && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleLogout}>
              Sair ({user.username})
            </button>
          )}
        </div>
      </header>

      <div className="main-grid">
        {/* COLUNA PRINCIPAL (AUTH / LOBBY / QUIZ / RESULTADO) */}
        <main>
          {screen === 'AUTH' && (
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">🔐 Autenticação de Jogador no BaaS (_User)</h2>
                <span className="version-pill">Recurso BaaS #1</span>
              </div>

              <div className="tab-group">
                <button
                  type="button"
                  className={`tab-btn ${authTab === 'login' ? 'active' : ''}`}
                  onClick={() => setAuthTab('login')}
                >
                  Entrar (Login)
                </button>
                <button
                  type="button"
                  className={`tab-btn ${authTab === 'register' ? 'active' : ''}`}
                  onClick={() => setAuthTab('register')}
                >
                  Criar Conta (Sign Up)
                </button>
              </div>

              {authError && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: '10px',
                    background: 'rgba(244, 63, 94, 0.16)',
                    border: '1px solid rgba(244, 63, 94, 0.4)',
                    color: '#fda4af',
                    fontSize: '0.85rem',
                    marginBottom: '14px',
                  }}
                >
                  {authError}
                </div>
              )}

              <form onSubmit={handleAuthSubmit}>
                <div className="form-group">
                  <label className="form-label">Nome de Usuário (Username)</label>
                  <input
                    className="form-input"
                    type="text"
                    required
                    placeholder="Ex: Gabriel_Cloud"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>

                {authTab === 'register' && (
                  <div className="form-group">
                    <label className="form-label">E-mail Acadêmico</label>
                    <input
                      className="form-input"
                      type="email"
                      required
                      placeholder="aluno@edu.unifor.br"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Senha</label>
                  <input
                    className="form-input"
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%', marginTop: '6px' }}
                  disabled={authLoading}
                >
                  {authLoading
                    ? 'Autenticando no BaaS...'
                    : authTab === 'register'
                    ? 'Registrar no Back4App (_User)'
                    : 'Autenticar e Entrar no Lobby'}
                </button>
              </form>

              <div
                style={{
                  marginTop: '18px',
                  paddingTop: '16px',
                  borderTop: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '10px',
                }}
              >
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Testando em duas abas ou demonstrando ao vivo?
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-emerald btn-sm"
                    onClick={() => handleQuickDemoLogin('Jogador1_OCI')}
                  >
                    ⚡ Demo Jogador 1
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleQuickDemoLogin('Jogador2_Docker')}
                  >
                    ⚡ Demo Jogador 2
                  </button>
                </div>
              </div>

              <div className="baas-features-grid">
                <div className="baas-feature-item">
                  <strong>1. Parse Auth (_User)</strong>
                  Registro, Login e Session Token seguro.
                </div>
                <div className="baas-feature-item">
                  <strong>2. Database Classes</strong>
                  Persistência em Question, GameScore e MultiplayerRoom.
                </div>
                <div className="baas-feature-item">
                  <strong>3. Segurança ACL &amp; CLP</strong>
                  Leitura pública no ranking e escrita restrita ao dono.
                </div>
                <div className="baas-feature-item">
                  <strong>4. LiveQuery &amp; Cloud Code</strong>
                  Salas multiplayer em tempo real + validação server-side.
                </div>
              </div>
            </div>
          )}

          {screen === 'LOBBY' && user && (
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">🎮 Lobby Multiplayer Sincronizado</h2>
                <span className="version-pill">Olá, {user.username}</span>
              </div>

              <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', marginBottom: '18px' }}>
                Escolha ou crie um código de sala para disputar em tempo real com outros jogadores
                conectados no mesmo código, ou jogue para bater o recorde no Ranking Global!
              </p>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: '12px',
                  alignItems: 'end',
                  marginBottom: '20px',
                }}
              >
                <div>
                  <label className="form-label">Código da Sala Multiplayer (MultiplayerRoom)</label>
                  <input
                    className="form-input"
                    type="text"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                    placeholder="Ex: UNIFOR-01"
                  />
                </div>
                <button type="button" className="btn btn-primary" onClick={handleStartMatch}>
                  🚀 Iniciar Partida CloudQuiz
                </button>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
                {['UNIFOR-01', 'OCI-PROD', 'DOCKER-LAB', 'GLOBAL'].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={`btn btn-sm ${
                      roomCode === preset ? 'btn-emerald' : 'btn-secondary'
                    }`}
                    onClick={() => setRoomCode(preset)}
                  >
                    Sala: {preset}
                  </button>
                ))}
              </div>

              {/* Jogadores Sincronizados na Sala */}
              <div
                style={{
                  padding: '16px',
                  borderRadius: '12px',
                  background: 'rgba(15, 23, 42, 0.75)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '10px',
                  }}
                >
                  <strong style={{ fontSize: '0.88rem', color: 'var(--accent-primary)' }}>
                    📡 Estado em Tempo Real da Sala [{roomCode}] (Recurso BaaS #4)
                  </strong>
                  <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                    {roomPlayers.length} jogador(es) ativo(s)
                  </span>
                </div>

                {roomPlayers.length === 0 ? (
                  <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)' }}>
                    Clique em &ldquo;Iniciar Partida CloudQuiz&rdquo; para entrar na sala{' '}
                    <strong>{roomCode}</strong>. Abra outra aba ou navegador na mesma sala para ver
                    a sincronização multiplayer ao vivo!
                  </p>
                ) : (
                  <div className="leaderboard-list">
                    {roomPlayers.map((p) => (
                      <div key={p.userId} className="leaderboard-row">
                        <div>
                          <strong>{p.username}</strong>{' '}
                          <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                            • Questão {p.currentQuestion} ({p.status})
                          </span>
                        </div>
                        <span
                          style={{
                            fontFamily: 'JetBrains Mono, monospace',
                            fontWeight: 700,
                            color: 'var(--accent-emerald)',
                          }}
                        >
                          {p.score} pts
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {screen === 'QUIZ' && currentQuestion && (
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">
                  ⚡ Sala [{roomCode}] — Questão {currentIndex + 1} de {questions.length}
                </h2>
                <span className="version-pill">{currentQuestion.category}</span>
              </div>

              {/* HUD DE PONTOS, TEMPO E STREAK */}
              <div className="quiz-hud">
                <div className="hud-box">
                  <div className="hud-label">Tempo</div>
                  <div
                    className="hud-value"
                    style={{
                      color:
                        timeRemaining <= 5 ? 'var(--accent-rose)' : 'var(--accent-primary)',
                    }}
                  >
                    {timeRemaining}s
                  </div>
                </div>
                <div className="hud-box">
                  <div className="hud-label">Pontuação</div>
                  <div className="hud-value" style={{ color: 'var(--accent-emerald)' }}>
                    {score}
                  </div>
                </div>
                <div className="hud-box">
                  <div className="hud-label">Streak 🔥</div>
                  <div className="hud-value" style={{ color: 'var(--accent-amber)' }}>
                    {streak}x
                  </div>
                </div>
                <div className="hud-box">
                  <div className="hud-label">Dificuldade</div>
                  <div className="hud-value" style={{ fontSize: '1rem', textTransform: 'uppercase' }}>
                    {currentQuestion.difficulty}
                  </div>
                </div>
              </div>

              {/* PERGUNTA */}
              <div className="question-box">
                <div className="question-meta">
                  <span>Tópico: {currentQuestion.category}</span>
                  <span>
                    Base: {GAME_CONFIG.BASE_POINTS_BY_DIFFICULTY[currentQuestion.difficulty]} pts
                  </span>
                </div>
                <div className="question-text">{currentQuestion.question}</div>
              </div>

              {/* OPÇÕES */}
              <div className="options-list">
                {currentQuestion.options.map((opt, idx) => {
                  let statusClass = '';
                  if (selectedOption !== null) {
                    if (idx === currentQuestion.correctIndex) statusClass = 'correct';
                    else if (idx === selectedOption) statusClass = 'wrong';
                  }

                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={selectedOption !== null}
                      className={`option-btn ${statusClass}`}
                      onClick={() => handleSelectAnswer(idx)}
                    >
                      <span className="option-letter">
                        {String.fromCharCode(65 + idx)}
                      </span>
                      <span>{opt}</span>
                    </button>
                  );
                })}
              </div>

              {/* EXPLICAÇÃO E DETALHAMENTO DE PONTOS APÓS RESPONDER */}
              {selectedOption !== null && (
                <div className="explanation-banner">
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '6px',
                      fontWeight: 700,
                    }}
                  >
                    <span>
                      {selectedOption === currentQuestion.correctIndex
                        ? '✅ Resposta Correta!'
                        : selectedOption === -1
                        ? '⏱️ Tempo Esgotado!'
                        : '❌ Resposta Incorreta!'}
                    </span>
                    {lastPointsBreakdown && lastPointsBreakdown.totalPoints > 0 && (
                      <span style={{ color: 'var(--accent-emerald)' }}>
                        +{lastPointsBreakdown.totalPoints} pts ({lastPointsBreakdown.basePoints}{' '}
                        base + {lastPointsBreakdown.timeBonus} tempo +{' '}
                        {lastPointsBreakdown.streakBonus} streak)
                      </span>
                    )}
                  </div>
                  <p style={{ color: 'var(--text-secondary)', marginBottom: '12px' }}>
                    {currentQuestion.explanation}
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ width: '100%' }}
                    onClick={handleNextQuestion}
                  >
                    {currentIndex + 1 < questions.length
                      ? 'Próxima Questão →'
                      : 'Finalizar e Salvar no Back4App (BaaS) 🏆'}
                  </button>
                </div>
              )}
            </div>
          )}

          {screen === 'RESULT' && (
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">
                  {matchEvaluation.badge} Resultado Final — {matchEvaluation.rankTitle}
                </h2>
                <span className="version-pill">
                  {matchEvaluation.isVictory ? 'APROVADO / VITÓRIA' : 'TENTE NOVAMENTE'}
                </span>
              </div>

              <div className="quiz-hud">
                <div className="hud-box">
                  <div className="hud-label">Score Final</div>
                  <div className="hud-value" style={{ color: 'var(--accent-emerald)' }}>
                    {score}
                  </div>
                </div>
                <div className="hud-box">
                  <div className="hud-label">Precisão</div>
                  <div className="hud-value">{matchEvaluation.accuracy}%</div>
                </div>
                <div className="hud-box">
                  <div className="hud-label">Acertos</div>
                  <div className="hud-value">
                    {correctAnswers}/{questions.length}
                  </div>
                </div>
                <div className="hud-box">
                  <div className="hud-label">Maior Streak</div>
                  <div className="hud-value" style={{ color: 'var(--accent-amber)' }}>
                    {maxStreak}x
                  </div>
                </div>
              </div>

              {lastSavedPayload && (
                <div style={{ marginBottom: '18px' }}>
                  <div className="form-label">
                    🔒 Payload Persistido no Back4App com ACL e Pointer Relacional (Recurso #3):
                  </div>
                  <pre className="code-preview">
                    {JSON.stringify(lastSavedPayload, null, 2)}
                  </pre>
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-primary" onClick={handleStartMatch}>
                  🔄 Jogar Novamente na Sala [{roomCode}]
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setScreen('LOBBY')}
                >
                  🏠 Voltar ao Lobby
                </button>
              </div>
            </div>
          )}
        </main>

        {/* COLUNA LATERAL (RANKING SINCRONIZADO + TELEMETRIA BaaS) */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* CARD 1: RANKING DE JOGADORES SINCRONIZADO */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">🏆 Ranking BaaS (GameScore)</h3>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  className={`btn btn-sm ${
                    roomFilter === 'ALL' ? 'btn-emerald' : 'btn-secondary'
                  }`}
                  onClick={() => setRoomFilter('ALL')}
                >
                  Global
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${
                    roomFilter === roomCode ? 'btn-emerald' : 'btn-secondary'
                  }`}
                  onClick={() => setRoomFilter(roomCode)}
                >
                  Sala {roomCode}
                </button>
              </div>
            </div>

            <div className="leaderboard-list">
              {leaderboard.slice(0, 7).map((entry, idx) => (
                <div
                  key={entry.objectId || idx}
                  className={`leaderboard-row ${
                    user && entry.playerName === user.username ? 'highlight' : ''
                  }`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span className="rank-pos">
                      {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}º`}
                    </span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                        {entry.playerName}
                      </div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                        {entry.rankTitle} • Sala {entry.roomCode || 'GLOBAL'} ({entry.accuracy}%)
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      fontFamily: 'JetBrains Mono, monospace',
                      fontWeight: 800,
                      color: 'var(--accent-primary)',
                    }}
                  >
                    {entry.score} pts
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CARD 2: TELEMETRIA EM TEMPO REAL DOS RECURSOS DO BaaS */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">📡 Telemetria BaaS (Back4App API)</h3>
              <span className="version-pill">Ao Vivo</span>
            </div>
            <div className="telemetry-feed">
              {telemetry.length === 0 ? (
                <div style={{ color: 'var(--text-secondary)' }}>
                  Aguardando eventos de integração com o BaaS...
                </div>
              ) : (
                telemetry.map((item) => (
                  <div key={item.id} className="telemetry-item">
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        color: 'var(--accent-primary)',
                        fontWeight: 700,
                        marginBottom: '2px',
                      }}
                    >
                      <span>{item.feature}</span>
                      <span style={{ color: 'var(--text-secondary)' }}>{item.timestamp}</span>
                    </div>
                    <div style={{ color: '#e2e8f0', fontWeight: 600 }}>{item.action}</div>
                    <div style={{ color: 'var(--text-secondary)' }}>{item.details}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* MODAL DE CONFIGURAÇÃO DO BACK4APP */}
      {showConfigModal && (
        <div className="modal-backdrop" onClick={() => setShowConfigModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="card-header">
              <h3 className="card-title">⚙️ Conexão com o Back4App (Parse BaaS)</h3>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowConfigModal(false)}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
              Informe o <strong>Application ID</strong> e a <strong>JavaScript Key</strong> do seu
              aplicativo no Back4App (ou configure no arquivo <code>.env</code>). Se deixado em
              branco, o jogo utiliza o Emulador Local Sincronizado entre abas.
            </p>

            <form onSubmit={handleSaveConfig}>
              <div className="form-group">
                <label className="form-label">VITE_BACK4APP_APP_ID (Application ID)</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="Cole seu Application ID do Back4App"
                  value={cfgAppId}
                  onChange={(e) => setCfgAppId(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">VITE_BACK4APP_JS_KEY (JavaScript Key)</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="Cole sua JavaScript Key do Back4App"
                  value={cfgJsKey}
                  onChange={(e) => setCfgJsKey(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  VITE_BACK4APP_LIVEQUERY_URL (Opcional — WebSocket LiveQuery)
                </label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="wss://seu-app.b4a.io"
                  value={cfgLiveQuery}
                  onChange={(e) => setCfgLiveQuery(e.target.value)}
                />
              </div>

              {seedMessage && (
                <div
                  style={{
                    fontSize: '0.8rem',
                    color: 'var(--accent-emerald)',
                    marginBottom: '12px',
                  }}
                >
                  {seedMessage}
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'space-between' }}>
                <button
                  type="button"
                  className="btn btn-emerald btn-sm"
                  onClick={handleSeedCloudQuestions}
                >
                  🌱 Popular Classe Question no Back4App
                </button>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setShowConfigModal(false)}
                  >
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-primary btn-sm">
                    Salvar Conexão
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
