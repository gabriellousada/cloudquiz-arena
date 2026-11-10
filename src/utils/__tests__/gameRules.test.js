import { describe, it, expect } from 'vitest';
import {
  calculateQuestionScore,
  evaluateMatchResult,
  buildBack4AppScorePayload,
  GAME_CONFIG,
} from '../gameRules';

describe('CloudQuiz - Testes Funcionais e Regras de Negócio (Vitest)', () => {
  describe('1. Cálculo de Pontuação (calculateQuestionScore)', () => {
    it('deve retornar 0 pontos e zerar a sequência (streak) quando a resposta estiver incorreta', () => {
      const result = calculateQuestionScore({
        isCorrect: false,
        difficulty: 'hard',
        timeRemaining: 18,
        currentStreak: 4,
      });

      expect(result.totalPoints).toBe(0);
      expect(result.basePoints).toBe(0);
      expect(result.timeBonus).toBe(0);
      expect(result.streakBonus).toBe(0);
      expect(result.newStreak).toBe(0);
    });

    it('deve calcular corretamente os pontos base + bônus de tempo no primeiro acerto', () => {
      const result = calculateQuestionScore({
        isCorrect: true,
        difficulty: 'medium', // 150 pontos base
        timeRemaining: 10, // 10 * 5 = 50 bônus de tempo
        currentStreak: 0, // 1º acerto -> sem bônus de streak
      });

      expect(result.basePoints).toBe(150);
      expect(result.timeBonus).toBe(50);
      expect(result.streakBonus).toBe(0);
      expect(result.newStreak).toBe(1);
      expect(result.totalPoints).toBe(200);
    });

    it('deve acumular bônus de sequência (streak) em acertos consecutivos e respeitar o teto máximo', () => {
      const secondHit = calculateQuestionScore({
        isCorrect: true,
        difficulty: 'hard', // 200 base
        timeRemaining: 20, // 20 * 5 = 100 time bonus
        currentStreak: 1, // newStreak = 2 -> 25 streak bonus
      });

      expect(secondHit.newStreak).toBe(2);
      expect(secondHit.streakBonus).toBe(25);
      expect(secondHit.totalPoints).toBe(325);

      const tenthHit = calculateQuestionScore({
        isCorrect: true,
        difficulty: 'hard',
        timeRemaining: 20,
        currentStreak: 9, // newStreak = 10 -> limitado a MAX_STREAK_BONUS (125)
      });

      expect(tenthHit.streakBonus).toBe(GAME_CONFIG.MAX_STREAK_BONUS);
      expect(tenthHit.totalPoints).toBe(200 + 100 + 125);
    });
  });

  describe('2. Regra de Vitória e Classificação Multiplayer (evaluateMatchResult)', () => {
    it('deve aprovar o jogador no modo SOLO quando atingir precisão >= 60% e score >= 500', () => {
      const result = evaluateMatchResult({
        score: 950,
        correctAnswers: 4,
        totalQuestions: 5,
      });

      expect(result.isVictory).toBe(true);
      expect(result.accuracy).toBe(80);
      expect(result.rankTitle).toBe('DevOps & SRE Lead');
      expect(result.multiplayerResult).toBe('SOLO');
    });

    it('deve determinar vitória ou derrota corretamente no modo Multiplayer Sincronizado', () => {
      const winMatch = evaluateMatchResult({
        score: 820,
        correctAnswers: 4,
        totalQuestions: 5,
        opponentScore: 690,
      });
      expect(winMatch.multiplayerResult).toBe('WIN');
      expect(winMatch.isVictory).toBe(true);

      const lossMatch = evaluateMatchResult({
        score: 650,
        correctAnswers: 4,
        totalQuestions: 5,
        opponentScore: 890,
      });
      expect(lossMatch.multiplayerResult).toBe('LOSS');
      expect(lossMatch.isVictory).toBe(false);
    });
  });

  describe('3. Validação do Payload e Segurança ACL para o Back4App BaaS (buildBack4AppScorePayload)', () => {
    it('deve formatar o payload no padrão Parse REST API com Pointer para _User e ACL de segurança', () => {
      const payload = buildBack4AppScorePayload({
        userId: 'usr_987654',
        username: 'GabrielCloud',
        score: 1250,
        correctAnswers: 5,
        totalQuestions: 5,
        maxStreak: 5,
        roomCode: 'oci-2026',
        category: 'Docker & CI/CD',
      });

      expect(payload.playerName).toBe('GabrielCloud');
      expect(payload.score).toBe(1250);
      expect(payload.accuracy).toBe(100);
      expect(payload.rankTitle).toBe('Principal Cloud Architect');
      expect(payload.roomCode).toBe('OCI-2026');

      // Verifica Pointer relacional para _User no Back4App
      expect(payload.player).toEqual({
        __type: 'Pointer',
        className: '_User',
        objectId: 'usr_987654',
      });

      // Verifica Regra de Segurança ACL (leitura pública, escrita restrita ao dono)
      expect(payload.ACL).toEqual({
        '*': { read: true },
        usr_987654: { read: true, write: true },
      });
    });

    it('deve lançar erro caso userId ou username estejam ausentes', () => {
      expect(() =>
        buildBack4AppScorePayload({
          userId: '',
          username: 'Tester',
          score: 500,
          correctAnswers: 3,
          totalQuestions: 5,
        })
      ).toThrow();
    });
  });
});
