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
  const maxTheoreticalScore = (Number(totalQuestions) || 6) * maxPossiblePerQuestion;

  if (typeof score !== 'number' || score < 0 || score > maxTheoreticalScore) {
    throw new Parse.Error(
      Parse.Error.VALIDATION_ERROR,
      `Pontuação inválida detectada pelo Cloud Code: ${score} pts.`
    );
  }

  const GameScore = Parse.Object.extend('GameScore');
  const gameScore = new GameScore();

  gameScore.set('playerName', playerName || user.get('username'));
  gameScore.set('score', Math.round(score));
  gameScore.set('correctAnswers', Number(correctAnswers) || 0);
  gameScore.set('totalQuestions', Number(totalQuestions) || 1);
  gameScore.set('accuracy', Number(accuracy) || 0);
  gameScore.set('maxStreak', Number(maxStreak) || 0);
  gameScore.set('rankTitle', rankTitle || 'Cloud Trainee');
  gameScore.set('roomCode', (roomCode || 'GLOBAL').toUpperCase());
  gameScore.set('category', category || 'Cloud & DevOps');
  gameScore.set('player', user);

  // Configura ACL (Leitura Pública para Ranking, Escrita restrita ao usuário dono)
  const acl = new Parse.ACL(user);
  acl.setPublicReadAccess(true);
  gameScore.setACL(acl);

  await gameScore.save(null, { useMasterKey: true });

  return {
    objectId: gameScore.id,
    playerName: gameScore.get('playerName'),
    score: gameScore.get('score'),
    accuracy: gameScore.get('accuracy'),
    rankTitle: gameScore.get('rankTitle'),
    roomCode: gameScore.get('roomCode'),
    createdAt: gameScore.createdAt,
  };
});
