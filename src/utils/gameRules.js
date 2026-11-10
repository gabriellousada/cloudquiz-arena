/**
 * Regras de Negócio e Lógica Principal do CloudQuiz (Multiplayer Sincronizado)
 * Este módulo concentra o cálculo de pontuação, regras de vitória/classificação,
 * validação de respostas e construção do payload com ACL para o Back4App (Parse BaaS).
 */

export const GAME_CONFIG = {
  BASE_POINTS_BY_DIFFICULTY: {
    easy: 100,
    medium: 150,
    hard: 200,
  },
  MAX_TIME_SECONDS: 20,
  TIME_BONUS_PER_SECOND: 5,
  STREAK_BONUS_STEP: 25,
  MAX_STREAK_BONUS: 125,
  PASSING_ACCURACY_PERCENT: 60,
  MIN_VICTORY_SCORE: 500,
};

/**
 * Calcula a pontuação de uma questão respondida com base na corretude,
 * dificuldade, tempo restante (em segundos) e sequência de acertos (streak).
 *
 * @param {Object} params
 * @param {boolean} params.isCorrect - Se o jogador acertou a alternativa
 * @param {'easy'|'medium'|'hard'} [params.difficulty='medium'] - Nível da questão
 * @param {number} [params.timeRemaining=0] - Segundos restantes no cronômetro (0 a 20)
 * @param {number} [params.currentStreak=0] - Quantidade de acertos seguidos ANTES desta questão
 * @returns {{ totalPoints: number, basePoints: number, timeBonus: number, streakBonus: number, newStreak: number }}
 */
export function calculateQuestionScore({
  isCorrect,
  difficulty = 'medium',
  timeRemaining = 0,
  currentStreak = 0,
}) {
  if (!isCorrect) {
    return {
      totalPoints: 0,
      basePoints: 0,
      timeBonus: 0,
      streakBonus: 0,
      newStreak: 0,
    };
  }

  const clampedTime = Math.max(
    0,
    Math.min(GAME_CONFIG.MAX_TIME_SECONDS, Math.floor(Number(timeRemaining) || 0))
  );
  const safeStreak = Math.max(0, Math.floor(Number(currentStreak) || 0));

  const basePoints =
    GAME_CONFIG.BASE_POINTS_BY_DIFFICULTY[difficulty] ??
    GAME_CONFIG.BASE_POINTS_BY_DIFFICULTY.medium;

  const timeBonus = clampedTime * GAME_CONFIG.TIME_BONUS_PER_SECOND;
  const newStreak = safeStreak + 1;

  // Bônus de streak a partir do 2º acerto consecutivo
  const rawStreakBonus =
    newStreak > 1 ? (newStreak - 1) * GAME_CONFIG.STREAK_BONUS_STEP : 0;
  const streakBonus = Math.min(GAME_CONFIG.MAX_STREAK_BONUS, rawStreakBonus);

  const totalPoints = basePoints + timeBonus + streakBonus;

  return {
    totalPoints,
    basePoints,
    timeBonus,
    streakBonus,
    newStreak,
  };
}

/**
 * Avalia o resultado final da partida (Regra de Vitória e Patente Cloud)
 * e determina o vencedor em modo Multiplayer Sincronizado.
 *
 * @param {Object} params
 * @param {number} params.score - Pontuação total obtida
 * @param {number} params.correctAnswers - Quantidade de questões corretas
 * @param {number} params.totalQuestions - Total de questões da partida
 * @param {number} [params.opponentScore=null] - Pontuação do oponente (se em sala multiplayer)
 * @returns {{ isVictory: boolean, accuracy: number, rankTitle: string, badge: string, multiplayerResult: 'WIN'|'LOSS'|'DRAW'|'SOLO' }}
 */
export function evaluateMatchResult({
  score,
  correctAnswers,
  totalQuestions,
  opponentScore = null,
}) {
  const safeTotal = Math.max(1, Number(totalQuestions) || 1);
  const safeCorrect = Math.max(0, Math.min(safeTotal, Number(correctAnswers) || 0));
  const safeScore = Math.max(0, Number(score) || 0);

  const accuracy = Math.round((safeCorrect / safeTotal) * 100);

  let multiplayerResult = 'SOLO';
  let isVictory =
    accuracy >= GAME_CONFIG.PASSING_ACCURACY_PERCENT &&
    safeScore >= GAME_CONFIG.MIN_VICTORY_SCORE;

  if (opponentScore !== null && opponentScore !== undefined) {
    const safeOpponent = Math.max(0, Number(opponentScore) || 0);
    if (safeScore > safeOpponent) {
      multiplayerResult = 'WIN';
      isVictory = true;
    } else if (safeScore < safeOpponent) {
      multiplayerResult = 'LOSS';
      isVictory = false;
    } else {
      multiplayerResult = 'DRAW';
      isVictory = accuracy >= GAME_CONFIG.PASSING_ACCURACY_PERCENT;
    }
  }

  let rankTitle = 'Cloud Trainee';
  let badge = '☁️';

  if (safeScore >= 1200 && accuracy >= 90) {
    rankTitle = 'Principal Cloud Architect';
    badge = '🏆';
  } else if (safeScore >= 900 && accuracy >= 75) {
    rankTitle = 'DevOps & SRE Lead';
    badge = '🚀';
  } else if (safeScore >= 600 && accuracy >= 60) {
    rankTitle = 'Cloud Engineer';
    badge = '⚡';
  } else if (safeScore >= 300) {
    rankTitle = 'Junior Cloud Developer';
    badge = '🛠️';
  }

  return {
    isVictory,
    accuracy,
    rankTitle,
    badge,
    multiplayerResult,
  };
}

/**
 * Formata e valida o payload que será enviado para a classe `GameScore` no Back4App (Parse BaaS),
 * incluindo obrigatoriamente as regras de segurança ACL (Access Control List):
 * - Leitura pública ("*": { read: true }) para exibição no Ranking Global.
 * - Escrita exclusiva do jogador autenticado ([userId]: { read: true, write: true }).
 *
 * @param {Object} params
 * @param {string} params.userId - objectId do usuário autenticado no Back4App (_User)
 * @param {string} params.username - Nome de exibição do jogador
 * @param {number} params.score - Pontuação total da partida
 * @param {number} params.correctAnswers - Acertos na partida
 * @param {number} params.totalQuestions - Total de questões da partida
 * @param {number} params.maxStreak - Maior sequência de acertos
 * @param {string} [params.roomCode='GLOBAL'] - Código da sala multiplayer
 * @param {string} [params.category='Cloud & DevOps'] - Categoria do quiz
 * @returns {Object} Payload formatado no padrão Parse REST API
 */
export function buildBack4AppScorePayload({
  userId,
  username,
  score,
  correctAnswers,
  totalQuestions,
  maxStreak = 0,
  roomCode = 'GLOBAL',
  category = 'Cloud & DevOps',
}) {
  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    throw new Error('userId é obrigatório para gerar o payload seguro do Back4App.');
  }
  if (!username || typeof username !== 'string' || !username.trim()) {
    throw new Error('username é obrigatório para salvar a pontuação no BaaS.');
  }
  if (typeof score !== 'number' || Number.isNaN(score) || score < 0) {
    throw new Error('score deve ser um número válido maior ou igual a zero.');
  }

  const evaluation = evaluateMatchResult({
    score,
    correctAnswers,
    totalQuestions,
  });

  const cleanUserId = userId.trim();

  return {
    playerName: username.trim(),
    score: Math.round(score),
    correctAnswers: Number(correctAnswers) || 0,
    totalQuestions: Number(totalQuestions) || 1,
    accuracy: evaluation.accuracy,
    maxStreak: Number(maxStreak) || 0,
    rankTitle: evaluation.rankTitle,
    roomCode: (roomCode || 'GLOBAL').toUpperCase().trim(),
    category,
    // Ponteiro relacional para a classe _User do Back4App (Parse Pointer)
    player: {
      __type: 'Pointer',
      className: '_User',
      objectId: cleanUserId,
    },
    // Regra de Segurança BaaS (ACL - Access Control List)
    ACL: {
      '*': {
        read: true,
      },
      [cleanUserId]: {
        read: true,
        write: true,
      },
    },
  };
}
