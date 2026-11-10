/**
 * Back4App Cloud Code (Parse Server) - CloudQuiz Arena
 * Para publicar no painel do Back4App:
 * Acesse: Cloud Code -> Functions & Web Hosting -> cloud/main.js -> Deploy
 */

Parse.Cloud.define('validateAndSaveScore', async (request) => {
  const user = request.user;
  if (!user) {
    throw new Parse.Error(
      Parse.Error.SESSION_MISSING,
      'Jogador precisa estar autenticado para registrar pontuação.'
    );
  }

  const {
    scoreObjectId,
    playerName,
    score,
    correctAnswers,
    totalQuestions,
    accuracy,
    maxStreak,
    rankTitle,
    roomCode,
    category,
  } = request.params;

  // Validação Anti-Cheat no Servidor (Cloud Code)
  const maxPossiblePerQuestion = 200 + 20 * 5 + 125; // 425 pts máx por questão
  const maxTheoreticalScore = Math.max(1, Number(totalQuestions) || 1) * maxPossiblePerQuestion;

  if (typeof score !== 'number' || score < 0 || score > maxTheoreticalScore) {
    throw new Parse.Error(
      Parse.Error.VALIDATION_ERROR,
      `Pontuação inválida detectada pelo Cloud Code: ${score} pts.`
    );
  }

  const GameScore = Parse.Object.extend('GameScore');
  let gameScore;

  if (scoreObjectId) {
    const query = new Parse.Query(GameScore);
    gameScore = await query.get(scoreObjectId, { useMasterKey: true });
    const owner = gameScore.get('player');
    if (!owner || owner.id !== user.id) {
      throw new Parse.Error(
        Parse.Error.OPERATION_FORBIDDEN,
        'Você só pode atualizar a sua própria pontuação.'
      );
    }
  } else {
    gameScore = new GameScore();
    gameScore.set('player', user);

    // Configura ACL (Leitura Pública para Ranking, Escrita restrita ao usuário dono)
    const acl = new Parse.ACL(user);
    acl.setPublicReadAccess(true);
    gameScore.setACL(acl);
  }

  gameScore.set('playerName', playerName || user.get('username'));
  gameScore.set('score', Math.round(score));
  gameScore.set('correctAnswers', Number(correctAnswers) || 0);
  gameScore.set('totalQuestions', Number(totalQuestions) || 1);
  gameScore.set('accuracy', Number(accuracy) || 0);
  gameScore.set('maxStreak', Number(maxStreak) || 0);
  gameScore.set('rankTitle', rankTitle || 'Cloud Trainee');
  gameScore.set('roomCode', (roomCode || 'GLOBAL').toUpperCase());
  gameScore.set('category', category || 'Cloud & DevOps');

  await gameScore.save(null, { useMasterKey: true });

  return {
    objectId: gameScore.id,
    playerName: gameScore.get('playerName'),
    score: gameScore.get('score'),
    accuracy: gameScore.get('accuracy'),
    rankTitle: gameScore.get('rankTitle'),
    roomCode: gameScore.get('roomCode'),
    createdAt: gameScore.createdAt,
    updatedAt: gameScore.updatedAt,
  };
});
