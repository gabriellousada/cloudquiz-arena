import React, { useState, useEffect, useRef } from 'react';
import {
  isBack4AppConfigured,
  getCurrentUser,
  registerPlayer,
  loginPlayer,
  logoutPlayer,
  fetchQuizQuestions,
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

const ROOM_PRESETS = ['UNIFOR-01', 'UNIFOR-02', 'GLOBAL'];

export default function App() {
  const [user, setUser] = useState(() => getCurrentUser());
  const [screen, setScreen] = useState(() => (getCurrentUser() ? 'LOBBY' : 'AUTH'));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Auth
  const [authTab, setAuthTab] = useState('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Lobby / Multiplayer
  const [roomCode, setRoomCode] = useState('UNIFOR-01');
  const [roomFilter, setRoomFilter] = useState('ALL');
  const [roomState, setRoomState] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [telemetry, setTelemetry] = useState([]);

  // Partida
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(GAME_CONFIG.MAX_TIME_SECONDS);
  const [selectedOption, setSelectedOption] = useState(null);
  const [lastPoints, setLastPoints] = useState(null);
  const [score, setScore] = useState(0);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [lastSavedPayload, setLastSavedPayload] = useState(null);

  const timerRef = useRef(null);

  useEffect(() => subscribeBaaSTelemetry(setTelemetry), []);

  useEffect(() => {
    loadLeaderboard(roomFilter);
  }, [roomFilter]);

  // Tempo real: sala multiplayer + novos recordes
  useEffect(() => {
    if (!user) return undefined;
    return subscribeRealtimeUpdates({
      roomCode,
      onRoomUpdate: setRoomState,
      onScoreCreated: () => loadLeaderboard(roomFilter),
    });
  }, [user, roomCode, roomFilter]);

  // Cronômetro da questão
  useEffect(() => {
    if (screen !== 'QUIZ' || selectedOption !== null) return undefined;
    timerRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          handleSelectAnswer(-1, 0); // tempo esgotado
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [screen, currentIndex, selectedOption]);

  async function loadLeaderboard(filter) {
    setLeaderboard(await fetchLeaderboard(filter));
  }

  async function runSafely(action) {
    setError('');
    setLoading(true);
    try {
      await action();
    } catch (err) {
      setError(err.message || 'Erro inesperado ao comunicar com o Back4App.');
    } finally {
      setLoading(false);
    }
  }

  function handleAuthSubmit(e) {
    e.preventDefault();
    runSafely(async () => {
      const logged =
        authTab === 'register'
          ? await registerPlayer({ username, email, password })
          : await loginPlayer({ username, password });
      setUser(logged);
      setPassword('');
      setScreen('LOBBY');
      loadLeaderboard(roomFilter);
    });
  }

  async function handleLogout() {
    await logoutPlayer();
    setUser(null);
    setRoomState(null);
    setScreen('AUTH');
  }

  function handleStartMatch() {
    runSafely(async () => {
      const [loadedQuestions, room] = await Promise.all([
        fetchQuizQuestions(),
        joinOrCreateMultiplayerRoom({ user, roomCode }),
      ]);
      setRoomState(room);
      setQuestions(loadedQuestions);
      setCurrentIndex(0);
      setScore(0);
      setCorrectAnswers(0);
      setStreak(0);
      setMaxStreak(0);
      setSelectedOption(null);
      setLastPoints(null);
      setTimeRemaining(GAME_CONFIG.MAX_TIME_SECONDS);
      setScreen('QUIZ');
    });
  }

  async function handleSelectAnswer(optionIndex, timeLeft = timeRemaining) {
    if (selectedOption !== null) return;
    clearInterval(timerRef.current);

    const question = questions[currentIndex];
    const isCorrect = optionIndex === question.correctIndex;
    const points = calculateQuestionScore({
      isCorrect,
      difficulty: question.difficulty,
      timeRemaining: timeLeft,
      currentStreak: streak,
    });

    const newScore = score + points.totalPoints;
    const newCorrect = isCorrect ? correctAnswers + 1 : correctAnswers;

    setSelectedOption(optionIndex);
    setLastPoints(points);
    setScore(newScore);
    setCorrectAnswers(newCorrect);
    setStreak(points.newStreak);
    setMaxStreak((prev) => Math.max(prev, points.newStreak));

    const updatedRoom = await updateMultiplayerProgress({
      user,
      roomState,
      score: newScore,
      currentQuestion: currentIndex + 1,
      correctAnswers: newCorrect,
      status: currentIndex + 1 >= questions.length ? 'FINISHED' : 'PLAYING',
    });
    setRoomState(updatedRoom);
  }

  function handleNextQuestion() {
    if (currentIndex + 1 < questions.length) {
      setCurrentIndex((prev) => prev + 1);
      setSelectedOption(null);
      setLastPoints(null);
      setTimeRemaining(GAME_CONFIG.MAX_TIME_SECONDS);
      return;
    }

    runSafely(async () => {
      const matchData = {
        score,
        correctAnswers,
        totalQuestions: questions.length,
        maxStreak,
        roomCode,
      };
      setLastSavedPayload(
        buildBack4AppScorePayload({ userId: user.objectId, username: user.username, ...matchData })
      );
      await submitMatchScore({ user, ...matchData });
      await loadLeaderboard(roomFilter);
      setScreen('RESULT');
    });
  }

  const roomPlayers = Object.values(roomState?.players || {});
  const opponents = roomPlayers.filter((p) => p.userId !== user?.objectId);
  const topOpponentScore = opponents.length ? Math.max(...opponents.map((o) => o.score || 0)) : null;
  const matchEvaluation = evaluateMatchResult({
    score,
    correctAnswers,
    totalQuestions: questions.length || 1,
    opponentScore: topOpponentScore,
  });
  const currentQuestion = questions[currentIndex];

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-group">
          <div className="brand-logo">☁️</div>
          <div>
            <div className="brand-title">
              CloudQuiz Arena
              <span className="version-pill">v1.0 • Vercel + Back4App</span>
            </div>
            <div className="brand-subtitle">Quiz multiplayer sincronizado — Desenvolvimento de Software em Nuvem (UNIFOR)</div>
          </div>
        </div>

        <div className="topbar-actions">
          <div className="status-badge">
            <span className={`status-dot ${isBack4AppConfigured ? 'online' : 'emulator'}`} />
            {isBack4AppConfigured ? 'Back4App conectado' : 'Back4App não configurado'}
          </div>
          {user && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleLogout}>
              Sair ({user.username})
            </button>
          )}
        </div>
      </header>

      {!isBack4AppConfigured && (
        <div className="alert alert-warning">
          ⚠️ Defina as variáveis <code>VITE_BACK4APP_APP_ID</code> e <code>VITE_BACK4APP_JS_KEY</code> no arquivo{' '}
          <code>.env</code> (local) ou em <strong>Settings → Environment Variables</strong> na Vercel e faça um novo deploy.
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      <div className="main-grid">
        <main>
          {/* ------------------------------ AUTH ------------------------------ */}
          {screen === 'AUTH' && (
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">🔐 Entrar no CloudQuiz</h2>
                <span className="version-pill">Back4App _User</span>
              </div>

              <div className="tab-group">
                <button type="button" className={`tab-btn ${authTab === 'login' ? 'active' : ''}`} onClick={() => setAuthTab('login')}>
                  Login
                </button>
                <button type="button" className={`tab-btn ${authTab === 'register' ? 'active' : ''}`} onClick={() => setAuthTab('register')}>
                  Criar conta
                </button>
              </div>

              <form onSubmit={handleAuthSubmit}>
                <div className="form-group">
                  <label className="form-label">Usuário</label>
                  <input className="form-input" required value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Ex: Gabriel_Cloud" />
                </div>
                {authTab === 'register' && (
                  <div className="form-group">
                    <label className="form-label">E-mail</label>
                    <input className="form-input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="aluno@edu.unifor.br" />
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Senha</label>
                  <input className="form-input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
                </div>
                <button type="submit" className="btn btn-primary btn-block" disabled={loading || !isBack4AppConfigured}>
                  {loading ? 'Conectando ao Back4App...' : authTab === 'register' ? 'Criar conta' : 'Entrar'}
                </button>
              </form>

              <p className="hint">
                💡 Para testar o multiplayer, abra duas abas, entre com contas diferentes e use o mesmo código de sala.
              </p>
            </div>
          )}

          {/* ------------------------------ LOBBY ------------------------------ */}
          {screen === 'LOBBY' && user && (
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">🎮 Lobby Multiplayer</h2>
                <span className="version-pill">Olá, {user.username}</span>
              </div>

              <label className="form-label">Código da sala</label>
              <div className="row">
                <input className="form-input" value={roomCode} onChange={(e) => setRoomCode(e.target.value.toUpperCase())} placeholder="UNIFOR-01" />
                <button type="button" className="btn btn-primary" onClick={handleStartMatch} disabled={loading}>
                  {loading ? 'Carregando...' : '🚀 Iniciar partida'}
                </button>
              </div>

              <div className="chips">
                {ROOM_PRESETS.map((preset) => (
                  <button key={preset} type="button" className={`btn btn-sm ${roomCode === preset ? 'btn-emerald' : 'btn-secondary'}`} onClick={() => setRoomCode(preset)}>
                    {preset}
                  </button>
                ))}
              </div>

              <RoomPlayers roomCode={roomCode} players={roomPlayers} />
            </div>
          )}

          {/* ------------------------------ QUIZ ------------------------------ */}
          {screen === 'QUIZ' && currentQuestion && (
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">⚡ [{roomCode}] Questão {currentIndex + 1}/{questions.length}</h2>
                <span className="version-pill">{currentQuestion.category}</span>
              </div>

              <div className="quiz-hud">
                <Hud label="Tempo" value={`${timeRemaining}s`} color={timeRemaining <= 5 ? 'var(--accent-rose)' : 'var(--accent-primary)'} />
                <Hud label="Pontos" value={score} color="var(--accent-emerald)" />
                <Hud label="Streak 🔥" value={`${streak}x`} color="var(--accent-amber)" />
                <Hud label="Nível" value={currentQuestion.difficulty.toUpperCase()} small />
              </div>

              <div className="question-box">
                <div className="question-meta">
                  <span>{currentQuestion.category}</span>
                  <span>Base: {GAME_CONFIG.BASE_POINTS_BY_DIFFICULTY[currentQuestion.difficulty]} pts</span>
                </div>
                <div className="question-text">{currentQuestion.question}</div>
              </div>

              <div className="options-list">
                {currentQuestion.options.map((opt, idx) => {
                  let status = '';
                  if (selectedOption !== null) {
                    if (idx === currentQuestion.correctIndex) status = 'correct';
                    else if (idx === selectedOption) status = 'wrong';
                  }
                  return (
                    <button key={idx} type="button" disabled={selectedOption !== null} className={`option-btn ${status}`} onClick={() => handleSelectAnswer(idx)}>
                      <span className="option-letter">{String.fromCharCode(65 + idx)}</span>
                      <span>{opt}</span>
                    </button>
                  );
                })}
              </div>

              {selectedOption !== null && (
                <div className="explanation-banner">
                  <div className="explanation-title">
                    <span>
                      {selectedOption === currentQuestion.correctIndex ? '✅ Correto!' : selectedOption === -1 ? '⏱️ Tempo esgotado!' : '❌ Incorreto!'}
                    </span>
                    {lastPoints?.totalPoints > 0 && (
                      <span className="text-emerald">
                        +{lastPoints.totalPoints} pts ({lastPoints.basePoints} base + {lastPoints.timeBonus} tempo + {lastPoints.streakBonus} streak)
                      </span>
                    )}
                  </div>
                  <p className="text-muted">{currentQuestion.explanation}</p>
                  <button type="button" className="btn btn-primary btn-block" onClick={handleNextQuestion} disabled={loading}>
                    {currentIndex + 1 < questions.length ? 'Próxima questão →' : loading ? 'Salvando no Back4App...' : 'Finalizar e salvar 🏆'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ------------------------------ RESULTADO ------------------------------ */}
          {screen === 'RESULT' && (
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">
                  {matchEvaluation.badge} {matchEvaluation.rankTitle}
                </h2>
                <span className="version-pill">{matchEvaluation.isVictory ? 'VITÓRIA' : 'TENTE NOVAMENTE'}</span>
              </div>

              <div className="quiz-hud">
                <Hud label="Score" value={score} color="var(--accent-emerald)" />
                <Hud label="Precisão" value={`${matchEvaluation.accuracy}%`} />
                <Hud label="Acertos" value={`${correctAnswers}/${questions.length}`} />
                <Hud label="Maior streak" value={`${maxStreak}x`} color="var(--accent-amber)" />
              </div>

              {lastSavedPayload && (
                <>
                  <div className="form-label">🔒 Registro salvo no Back4App (com Pointer e ACL):</div>
                  <pre className="code-preview">{JSON.stringify(lastSavedPayload, null, 2)}</pre>
                </>
              )}

              <div className="chips">
                <button type="button" className="btn btn-primary" onClick={handleStartMatch} disabled={loading}>
                  🔄 Jogar novamente
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setScreen('LOBBY')}>
                  🏠 Lobby
                </button>
              </div>
            </div>
          )}
        </main>

        {/* ------------------------------ LATERAL ------------------------------ */}
        <aside className="sidebar">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">🏆 Ranking</h3>
              <div className="chips no-margin">
                <button type="button" className={`btn btn-sm ${roomFilter === 'ALL' ? 'btn-emerald' : 'btn-secondary'}`} onClick={() => setRoomFilter('ALL')}>
                  Global
                </button>
                <button type="button" className={`btn btn-sm ${roomFilter === roomCode ? 'btn-emerald' : 'btn-secondary'}`} onClick={() => setRoomFilter(roomCode)}>
                  {roomCode}
                </button>
              </div>
            </div>

            <div className="leaderboard-list">
              {leaderboard.length === 0 && <p className="text-muted">Nenhuma pontuação registrada ainda.</p>}
              {leaderboard.slice(0, 10).map((entry, idx) => (
                <div key={entry.objectId || idx} className={`leaderboard-row ${entry.playerName === user?.username ? 'highlight' : ''}`}>
                  <div className="row-left">
                    <span className="rank-pos">{['🥇', '🥈', '🥉'][idx] || `${idx + 1}º`}</span>
                    <div>
                      <div className="player-name">{entry.playerName}</div>
                      <div className="player-meta">
                        {entry.rankTitle} • {entry.roomCode || 'GLOBAL'} ({entry.accuracy}%)
                      </div>
                    </div>
                  </div>
                  <span className="score-mono">{entry.score} pts</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">📡 Telemetria Back4App</h3>
              <span className="version-pill">Ao vivo</span>
            </div>
            <div className="telemetry-feed">
              {telemetry.length === 0 && <div className="text-muted">Aguardando chamadas ao Back4App...</div>}
              {telemetry.map((item) => (
                <div key={item.id} className={`telemetry-item ${item.status === 'WARN' ? 'warn' : ''}`}>
                  <div className="telemetry-head">
                    <span>{item.feature}</span>
                    <span className="text-muted">{item.timestamp}</span>
                  </div>
                  <div className="telemetry-action">{item.action}</div>
                  <div className="text-muted">{item.details}</div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Hud({ label, value, color, small }) {
  return (
    <div className="hud-box">
      <div className="hud-label">{label}</div>
      <div className="hud-value" style={{ color, fontSize: small ? '1rem' : undefined }}>
        {value}
      </div>
    </div>
  );
}

function RoomPlayers({ roomCode, players }) {
  return (
    <div className="room-box">
      <div className="room-head">
        <strong>📡 Sala [{roomCode}] em tempo real</strong>
        <span className="text-muted">{players.length} jogador(es)</span>
      </div>
      {players.length === 0 ? (
        <p className="text-muted">Inicie uma partida para entrar na sala. Jogadores na mesma sala aparecem aqui ao vivo.</p>
      ) : (
        <div className="leaderboard-list">
          {players.map((p) => (
            <div key={p.userId} className="leaderboard-row">
              <div>
                <strong>{p.username}</strong> <span className="player-meta">• Questão {p.currentQuestion} ({p.status})</span>
              </div>
              <span className="score-mono text-emerald">{p.score} pts</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
