import React, { useState, useEffect, useRef } from 'react';
import {
  isBack4AppConfigured,
  getCurrentUser,
  registerPlayer,
  loginPlayer,
  logoutPlayer,
  fetchQuizQuestions,
  fetchLeaderboard,
  fetchMultiplayerRoom,
  submitMatchScore,
  joinOrCreateMultiplayerRoom,
  updateMultiplayerProgress,
  subscribeRealtimeUpdates,
} from './services/back4app';
import {
  calculateQuestionScore,
  evaluateMatchResult,
  GAME_CONFIG,
} from './utils/gameRules';

const ROOM_PRESETS = ['UNIFOR-01', 'UNIFOR-02', 'GLOBAL'];

const DIFFICULTY_LABELS = {
  easy: 'Fácil',
  medium: 'Médio',
  hard: 'Difícil',
};

function getInitials(name = '') {
  const clean = name.trim();
  if (!clean) return 'JG';
  const parts = clean.split(/[\s_-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

function formatScoreDateTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  const day = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
  const time = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
  return `${day} às ${time}`;
}

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

  const timerRef = useRef(null);
  const matchSavedRef = useRef(false);

  useEffect(() => {
    loadLeaderboard(roomFilter);
  }, [roomFilter]);

  useEffect(() => {
    if (!user) {
      setRoomState(null);
      return;
    }
    fetchMultiplayerRoom(roomCode).then(setRoomState);
  }, [user, roomCode]);

  // Tempo real: sala multiplayer (a cada questão) + histórico de pontuações
  useEffect(() => {
    return subscribeRealtimeUpdates({
      roomCode,
      roomFilter,
      includeRoom: Boolean(user),
      onRoomUpdate: setRoomState,
      onLeaderboardUpdate: setLeaderboard,
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
      setError(err.message || 'Não foi possível concluir a operação.');
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
      matchSavedRef.current = false;
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
    const newMaxStreak = Math.max(maxStreak, points.newStreak);
    const answeredCount = currentIndex + 1;
    const isMatchFinished = answeredCount >= questions.length;

    setSelectedOption(optionIndex);
    setLastPoints(points);
    setScore(newScore);
    setCorrectAnswers(newCorrect);
    setStreak(points.newStreak);
    setMaxStreak(newMaxStreak);

    try {
      const updatedRoom = await updateMultiplayerProgress({
        user,
        roomState,
        score: newScore,
        currentQuestion: answeredCount,
        correctAnswers: newCorrect,
        maxStreak: newMaxStreak,
        status: isMatchFinished ? 'FINISHED' : 'PLAYING',
      });
      setRoomState(updatedRoom);
    } catch (err) {
      setError(err.message || 'Não foi possível atualizar o ranking em tempo real da sala.');
    }
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
      if (!matchSavedRef.current) {
        await submitMatchScore({
          user,
          score,
          correctAnswers,
          totalQuestions: questions.length,
          maxStreak,
          roomCode,
        });
        matchSavedRef.current = true;
      }
      await loadLeaderboard(roomFilter);
      setScreen('RESULT');
    });
  }

  const roomPlayers = Object.values(roomState?.players || {}).sort(
    (a, b) => (b.score || 0) - (a.score || 0)
  );
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
            <div className="brand-title">CloudQuiz Arena</div>
            <div className="brand-subtitle">
              Desafio Multiplayer de Computação em Nuvem
            </div>
          </div>
        </div>

        <div className="topbar-actions">
          <div className="status-badge">
            <span className={`status-dot ${isBack4AppConfigured ? 'online' : 'emulator'}`} />
            {isBack4AppConfigured ? 'Servidor Online' : 'Servidor Offline'}
          </div>
          {user && (
            <div className="user-topbar-pill">
              <span className="user-avatar-sm">{getInitials(user.username)}</span>
              <span className="user-topbar-name">{user.username}</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={handleLogout}>
                Sair
              </button>
            </div>
          )}
        </div>
      </header>

      {!isBack4AppConfigured && (
        <div className="alert alert-warning">
          ⚠️ Configure as variáveis de ambiente do servidor para habilitar o login e o ranking online.
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      <div className="main-grid">
        <main>
          {/* ------------------------------ AUTH ------------------------------ */}
          {screen === 'AUTH' && (
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">🔐 Acessar o CloudQuiz</h2>
              </div>

              <div className="tab-group">
                <button
                  type="button"
                  className={`tab-btn ${authTab === 'login' ? 'active' : ''}`}
                  onClick={() => setAuthTab('login')}
                >
                  Entrar
                </button>
                <button
                  type="button"
                  className={`tab-btn ${authTab === 'register' ? 'active' : ''}`}
                  onClick={() => setAuthTab('register')}
                >
                  Criar Conta
                </button>
              </div>

              <form onSubmit={handleAuthSubmit}>
                <div className="form-group">
                  <label className="form-label">Nome de Jogador</label>
                  <input
                    className="form-input"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Ex: Gabriel"
                  />
                </div>
                {authTab === 'register' && (
                  <div className="form-group">
                    <label className="form-label">E-mail</label>
                    <input
                      className="form-input"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="seuemail@exemplo.com"
                    />
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Senha</label>
                  <input
                    className="form-input"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary btn-block"
                  disabled={loading || !isBack4AppConfigured}
                >
                  {loading
                    ? 'Aguarde...'
                    : authTab === 'register'
                    ? 'Criar conta e jogar'
                    : 'Entrar no jogo'}
                </button>
              </form>

              <p className="hint">
                💡 Convide seus amigos para a mesma sala e disputem quem faz mais pontos em tempo real!
              </p>
            </div>
          )}

          {/* ------------------------------ LOBBY ------------------------------ */}
          {screen === 'LOBBY' && user && (
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">🎮 Lobby Multiplayer</h2>
                <span className="version-pill">Bem-vindo, {user.username}</span>
              </div>

              <label className="form-label">Escolha ou digite o código da sala</label>
              <div className="row">
                <input
                  className="form-input"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="UNIFOR-01"
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleStartMatch}
                  disabled={loading}
                >
                  {loading ? 'Preparando...' : '🚀 Iniciar Partida'}
                </button>
              </div>

              <div className="chips">
                {ROOM_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={`btn btn-sm ${roomCode === preset ? 'btn-emerald' : 'btn-secondary'}`}
                    onClick={() => setRoomCode(preset)}
                  >
                    Sala {preset}
                  </button>
                ))}
              </div>

              <div className="room-info-banner">
                <strong>💡 Como jogar em grupo</strong>
                <p className="text-muted">
                  Compartilhe o código <strong>{roomCode}</strong> com outro jogador e clique em{' '}
                  <strong>Iniciar Partida</strong>. A disputa aparece ao vivo no painel{' '}
                  <strong>⚡ Ranking da Sala em Tempo Real</strong> ao lado!
                </p>
              </div>
            </div>
          )}

          {/* ------------------------------ QUIZ ------------------------------ */}
          {screen === 'QUIZ' && currentQuestion && (
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">
                  ⚡ Questão {currentIndex + 1} de {questions.length}
                </h2>
                <span className="version-pill">{currentQuestion.category}</span>
              </div>

              <div className="quiz-hud">
                <Hud
                  label="Tempo"
                  value={`${timeRemaining}s`}
                  color={timeRemaining <= 5 ? 'var(--accent-rose)' : 'var(--accent-primary)'}
                />
                <Hud label="Pontos" value={score} color="var(--accent-emerald)" />
                <Hud label="Sequência 🔥" value={`${streak}x`} color="var(--accent-amber)" />
                <Hud
                  label="Dificuldade"
                  value={DIFFICULTY_LABELS[currentQuestion.difficulty] || 'Médio'}
                  small
                />
              </div>

              <div className="question-box">
                <div className="question-meta">
                  <span>{currentQuestion.category}</span>
                  <span>
                    Valor base: {GAME_CONFIG.BASE_POINTS_BY_DIFFICULTY[currentQuestion.difficulty]} pts
                  </span>
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
                    <button
                      key={idx}
                      type="button"
                      disabled={selectedOption !== null}
                      className={`option-btn ${status}`}
                      onClick={() => handleSelectAnswer(idx)}
                    >
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
                      {selectedOption === currentQuestion.correctIndex
                        ? '✅ Resposta Correta!'
                        : selectedOption === -1
                        ? '⏱️ Tempo Esgotado!'
                        : '❌ Resposta Incorreta!'}
                    </span>
                    {lastPoints?.totalPoints > 0 && (
                      <span className="text-emerald">
                        +{lastPoints.totalPoints} pts ({lastPoints.basePoints} base +{' '}
                        {lastPoints.timeBonus} tempo + {lastPoints.streakBonus} sequência)
                      </span>
                    )}
                  </div>
                  <p className="text-muted">{currentQuestion.explanation}</p>
                  <button
                    type="button"
                    className="btn btn-primary btn-block"
                    onClick={handleNextQuestion}
                    disabled={loading}
                  >
                    {currentIndex + 1 < questions.length
                      ? 'Próxima Questão →'
                      : loading
                      ? 'Salvando pontuação...'
                      : 'Ver Resultado Final 🏆'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ------------------------------ RESULTADO ------------------------------ */}
          {screen === 'RESULT' && (
            <div className="card result-card">
              <div className="result-hero">
                <div className="result-badge-icon">{matchEvaluation.badge}</div>
                <div className="result-status-pill">
                  {matchEvaluation.isVictory ? '🎉 Parabéns! Mandou muito bem!' : '💪 Bom esforço! Continue praticando!'}
                </div>
                <h2 className="result-rank-title">{matchEvaluation.rankTitle}</h2>
                <p className="text-muted">
                  Sua pontuação já foi registrada no Ranking de Jogadores.
                </p>
              </div>

              <div className="quiz-hud">
                <Hud label="Pontuação Total" value={score} color="var(--accent-emerald)" />
                <Hud label="Precisão" value={`${matchEvaluation.accuracy}%`} />
                <Hud label="Acertos" value={`${correctAnswers}/${questions.length}`} />
                <Hud label="Maior Sequência" value={`${maxStreak}x`} color="var(--accent-amber)" />
              </div>

              <div className="chips result-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleStartMatch}
                  disabled={loading}
                >
                  🔄 Jogar Novamente
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

        {/* ------------------------------ RANKINGS SEPARADOS ------------------------------ */}
        <aside className="sidebar">
          {/* ESPAÇO 1: RANKING EM TEMPO REAL DA SALA ATUAL */}
          <div className="card ranking-card live-room-card">
            <LiveRoomRanking
              roomCode={roomCode}
              players={roomPlayers}
              currentUser={user}
            />
          </div>

          {/* ESPAÇO 2: RANKING ANTERIOR (HISTÓRICO DE PARTIDAS) */}
          <div className="card ranking-card">
            <div className="ranking-header">
              <div>
                <h3 className="card-title">📜 Ranking Anterior</h3>
                <p className="ranking-subtitle">Histórico de pontuações já encerradas</p>
              </div>
              <div className="ranking-filters">
                <button
                  type="button"
                  className={`filter-pill ${roomFilter === 'ALL' ? 'active' : ''}`}
                  onClick={() => setRoomFilter('ALL')}
                >
                  🌍 Geral
                </button>
                <button
                  type="button"
                  className={`filter-pill ${roomFilter === roomCode ? 'active' : ''}`}
                  onClick={() => setRoomFilter(roomCode)}
                >
                  🎯 Sala {roomCode}
                </button>
              </div>
            </div>

            <div className="leaderboard-list">
              {leaderboard.length === 0 ? (
                <div className="empty-ranking">
                  <div className="empty-ranking-icon">🏅</div>
                  <p>Nenhuma pontuação anterior registrada.</p>
                  <span>Finalize uma partida para salvar no histórico!</span>
                </div>
              ) : (
                leaderboard.slice(0, 10).map((entry, idx) => {
                  const isCurrentUser = user && entry.playerName === user.username;
                  const podiumClass =
                    idx === 0 ? 'podium-gold' : idx === 1 ? 'podium-silver' : idx === 2 ? 'podium-bronze' : '';
                  const dateLabel = formatScoreDateTime(entry.createdAt || entry.updatedAt);

                  return (
                    <div
                      key={entry.objectId || idx}
                      className={`ranking-item ${podiumClass} ${isCurrentUser ? 'is-me' : ''}`}
                    >
                      <div className="ranking-left">
                        <div className={`ranking-medal ${podiumClass}`}>
                          {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}º`}
                        </div>

                        <div className="ranking-avatar">
                          {getInitials(entry.playerName)}
                        </div>

                        <div className="ranking-user-info">
                          <div className="ranking-name-row">
                            <span className="ranking-player-name">{entry.playerName}</span>
                            {isCurrentUser && <span className="you-badge">Você</span>}
                          </div>
                          <div className="ranking-user-details">
                            <span className="ranking-title-badge">{entry.rankTitle}</span>
                            <span className="ranking-dot">•</span>
                            <span>{entry.accuracy}% de acerto</span>
                            {entry.maxStreak > 1 && (
                              <>
                                <span className="ranking-dot">•</span>
                                <span>🔥 {entry.maxStreak}x</span>
                              </>
                            )}
                          </div>
                          {dateLabel && (
                            <div className="ranking-date-row">
                              🕒 {dateLabel}
                              {entry.roomCode ? ` • Sala ${entry.roomCode}` : ''}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="ranking-score-box">
                        <span className="ranking-score-value">{entry.score}</span>
                        <span className="ranking-score-unit">pts</span>
                      </div>
                    </div>
                  );
                })
              )}
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

function LiveRoomRanking({ roomCode, players, currentUser }) {
  return (
    <div>
      <div className="ranking-header">
        <div>
          <h3 className="card-title">
            ⚡ Ranking da Sala
            <span className="live-pill">● Ao vivo</span>
          </h3>
          <p className="ranking-subtitle">
            Sala <strong>{roomCode}</strong> • Atualizado a cada questão
          </p>
        </div>
        <span className="room-count-pill">{players.length} na sala</span>
      </div>

      {!currentUser ? (
        <div className="empty-ranking">
          <div className="empty-ranking-icon">⚡</div>
          <p>Disputa em tempo real por sala</p>
          <span>Entre com sua conta para acompanhar o ranking ao vivo da sua sala.</span>
        </div>
      ) : players.length === 0 ? (
        <div className="empty-ranking">
          <div className="empty-ranking-icon">👥</div>
          <p>Nenhum jogador ativo em {roomCode}</p>
          <span>Clique em &ldquo;Iniciar Partida&rdquo; para abrir o placar em tempo real!</span>
        </div>
      ) : (
        <div className="leaderboard-list">
          {players.map((p, idx) => {
            const isMe = currentUser && p.userId === currentUser.objectId;
            const podiumClass =
              idx === 0 ? 'podium-gold' : idx === 1 ? 'podium-silver' : idx === 2 ? 'podium-bronze' : '';
            return (
              <div key={p.userId} className={`ranking-item ${podiumClass} ${isMe ? 'is-me' : ''}`}>
                <div className="ranking-left">
                  <div className={`ranking-medal ${podiumClass}`}>
                    {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}º`}
                  </div>
                  <div className="ranking-avatar">{getInitials(p.username)}</div>
                  <div className="ranking-user-info">
                    <div className="ranking-name-row">
                      <span className="ranking-player-name">{p.username}</span>
                      {isMe && <span className="you-badge">Você</span>}
                    </div>
                    <div className="ranking-user-details">
                      <span>
                        {p.status === 'FINISHED'
                          ? '✅ Finalizado'
                          : `⚡ Questão ${p.currentQuestion}`}
                      </span>
                      <span className="ranking-dot">•</span>
                      <span>{p.correctAnswers || 0} acerto(s)</span>
                      {p.maxStreak > 1 && (
                        <>
                          <span className="ranking-dot">•</span>
                          <span>🔥 {p.maxStreak}x</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="ranking-score-box">
                  <span className="ranking-score-value">{p.score}</span>
                  <span className="ranking-score-unit">pts</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
