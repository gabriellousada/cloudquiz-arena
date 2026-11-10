/**
 * Cliente do Back4App (Parse Server) via REST API + LiveQuery (WebSocket).
 * Todo o backend do CloudQuiz roda no Back4App; o frontend (Vite) é hospedado na Vercel.
 *
 * Recursos do BaaS utilizados:
 *  1. Autenticação (_User)          -> registerPlayer / loginPlayer / logoutPlayer
 *  2. Banco de dados (Classes)      -> Question, GameScore, MultiplayerRoom
 *  3. Segurança (ACL / CLP)         -> ACL aplicada em cada GameScore
 *  4. Tempo real (LiveQuery)        -> subscribeRealtimeUpdates
 *  5. Cloud Code Functions          -> validateAndSaveScore (cloud/main.js)
 */
import { DEFAULT_CLOUD_QUESTIONS } from '../data/defaultQuestions';
import { buildBack4AppScorePayload } from '../utils/gameRules';

// sessionStorage => cada aba tem sua própria sessão (facilita testar o multiplayer com 2 abas)
const SESSION_KEY = 'cloudquiz_session_v2';

export const BACK4APP = {
  appId: (import.meta.env.VITE_BACK4APP_APP_ID || '').trim(),
  jsKey: (import.meta.env.VITE_BACK4APP_JS_KEY || '').trim(),
  serverUrl: (import.meta.env.VITE_BACK4APP_SERVER_URL || 'https://parseapi.back4app.com')
    .trim()
    .replace(/\/$/, ''),
  liveQueryUrl: (import.meta.env.VITE_BACK4APP_LIVEQUERY_URL || '').trim(),
};

export const isBack4AppConfigured = Boolean(BACK4APP.appId && BACK4APP.jsKey);

// ---------------------------------------------------------------------------
// Telemetria (painel "Telemetria BaaS" da interface)
// ---------------------------------------------------------------------------
const telemetryListeners = new Set();
const telemetryLogs = [];

export function subscribeBaaSTelemetry(callback) {
  telemetryListeners.add(callback);
  callback([...telemetryLogs]);
  return () => telemetryListeners.delete(callback);
}

function logBaaSEvent(feature, action, details, status = 'SUCCESS') {
  telemetryLogs.unshift({
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toLocaleTimeString('pt-BR'),
    feature,
    action,
    details,
    status,
  });
  if (telemetryLogs.length > 25) telemetryLogs.pop();
  telemetryListeners.forEach((cb) => cb([...telemetryLogs]));
}

// ---------------------------------------------------------------------------
// Cliente HTTP da API REST do Parse
// ---------------------------------------------------------------------------
async function parseRequest(path, { method = 'GET', body, sessionToken } = {}) {
  if (!isBack4AppConfigured) {
    throw new Error(
      'Back4App não configurado. Defina VITE_BACK4APP_APP_ID e VITE_BACK4APP_JS_KEY (.env local ou Environment Variables na Vercel).'
    );
  }

  const headers = {
    'X-Parse-Application-Id': BACK4APP.appId,
    'X-Parse-JavaScript-Key': BACK4APP.jsKey,
    'Content-Type': 'application/json',
  };
  if (sessionToken) headers['X-Parse-Session-Token'] = sessionToken;

  const response = await fetch(`${BACK4APP.serverUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    // 209 = sessão inválida/expirada
    if (data.code === 209) sessionStorage.removeItem(SESSION_KEY);
    const error = new Error(data.error || `Erro HTTP ${response.status} no Back4App`);
    error.code = data.code;
    throw error;
  }
  return data;
}

// ============================================================================
// RECURSO #1: AUTENTICAÇÃO (_User)
// ============================================================================
function saveSession(user) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
  return user;
}

export function getCurrentUser() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function registerPlayer({ username, email, password }) {
  const cleanUsername = username.trim();
  const cleanEmail = email.trim().toLowerCase();

  const res = await parseRequest('/users', {
    method: 'POST',
    body: { username: cleanUsername, email: cleanEmail, password },
  });

  logBaaSEvent('1. Auth (_User)', 'POST /users', `Usuário "${cleanUsername}" registrado (${res.objectId})`);
  return saveSession({
    objectId: res.objectId,
    username: cleanUsername,
    email: cleanEmail,
    sessionToken: res.sessionToken,
  });
}

export async function loginPlayer({ username, password }) {
  const res = await parseRequest('/login', {
    method: 'POST',
    body: { username: username.trim(), password },
  });

  logBaaSEvent('1. Auth (_User)', 'POST /login', `Sessão iniciada para "${res.username}"`);
  return saveSession({
    objectId: res.objectId,
    username: res.username,
    email: res.email || '',
    sessionToken: res.sessionToken,
  });
}

export async function logoutPlayer() {
  const current = getCurrentUser();
  if (current?.sessionToken) {
    try {
      await parseRequest('/logout', { method: 'POST', sessionToken: current.sessionToken });
    } catch {
      // sessão já expirada: apenas limpa localmente
    }
  }
  sessionStorage.removeItem(SESSION_KEY);
  logBaaSEvent('1. Auth (_User)', 'POST /logout', 'Sessão encerrada');
}

// ============================================================================
// RECURSO #2: BANCO DE DADOS (Question / GameScore)
// ============================================================================
export async function fetchQuizQuestions() {
  try {
    const data = await parseRequest('/classes/Question?limit=50');
    if (data.results?.length) {
      logBaaSEvent('2. Database (Question)', 'GET /classes/Question', `${data.results.length} questões carregadas`);
      return data.results;
    }
    logBaaSEvent(
      '2. Database (Question)',
      'Classe Question vazia',
      'Usando questões padrão. Rode "npm run seed" para popular o Back4App.',
      'WARN'
    );
  } catch (err) {
    logBaaSEvent('2. Database (Question)', 'Erro ao buscar questões', err.message, 'WARN');
  }
  return DEFAULT_CLOUD_QUESTIONS;
}

export async function fetchLeaderboard(roomFilter = 'ALL') {
  if (!isBack4AppConfigured) return [];
  try {
    const where =
      roomFilter && roomFilter !== 'ALL'
        ? `&where=${encodeURIComponent(JSON.stringify({ roomCode: roomFilter.toUpperCase() }))}`
        : '';
    const data = await parseRequest(`/classes/GameScore?order=-score,-accuracy&limit=15${where}`);
    logBaaSEvent('2. Database (GameScore)', 'GET /classes/GameScore', `${data.results?.length || 0} registros no ranking`);
    return data.results || [];
  } catch (err) {
    logBaaSEvent('2. Database (GameScore)', 'Erro ao buscar ranking', err.message, 'WARN');
    return [];
  }
}

// ============================================================================
// RECURSOS #3 e #5: ACL + CLOUD CODE (salvar pontuação)
// ============================================================================
export async function submitMatchScore({ user, score, correctAnswers, totalQuestions, maxStreak, roomCode = 'GLOBAL' }) {
  const payload = buildBack4AppScorePayload({
    userId: user.objectId,
    username: user.username,
    score,
    correctAnswers,
    totalQuestions,
    maxStreak,
    roomCode,
  });

  logBaaSEvent(
    '3. Segurança (ACL)',
    'ACL aplicada',
    `{"*":{"read":true}, "${user.objectId}":{"read":true,"write":true}}`
  );

  // 1ª opção: Cloud Function com validação anti-cheat no servidor
  try {
    const res = await parseRequest('/functions/validateAndSaveScore', {
      method: 'POST',
      sessionToken: user.sessionToken,
      body: payload,
    });
    logBaaSEvent('5. Cloud Code', 'POST /functions/validateAndSaveScore', `${payload.score} pts validados e salvos`);
    return res.result || payload;
  } catch (err) {
    logBaaSEvent('5. Cloud Code', 'Function indisponível', `${err.message} — salvando direto na classe`, 'WARN');
  }

  // Fallback: grava direto na classe GameScore (com a mesma ACL)
  const created = await parseRequest('/classes/GameScore', {
    method: 'POST',
    sessionToken: user.sessionToken,
    body: payload,
  });
  logBaaSEvent('2. Database (GameScore)', 'POST /classes/GameScore', `${payload.score} pts salvos (${created.objectId})`);
  return { ...payload, objectId: created.objectId, createdAt: created.createdAt };
}

// ============================================================================
// RECURSO #4: MULTIPLAYER EM TEMPO REAL (MultiplayerRoom + LiveQuery)
// ============================================================================
function normalizeRoomCode(roomCode) {
  return (roomCode || 'UNIFOR-01').toUpperCase().trim();
}

async function findRoom(roomCode) {
  const where = encodeURIComponent(JSON.stringify({ roomCode }));
  const res = await parseRequest(`/classes/MultiplayerRoom?where=${where}&limit=1`);
  return res.results?.[0] || null;
}

function buildPlayerState(user, { score = 0, currentQuestion = 1, correctAnswers = 0, status = 'PLAYING' } = {}) {
  return {
    userId: user.objectId,
    username: user.username,
    score,
    currentQuestion,
    correctAnswers,
    status,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Atualiza SOMENTE a chave do jogador dentro de `players` (dot-notation do Parse),
 * evitando sobrescrever o progresso dos outros jogadores da sala.
 */
async function upsertPlayerInRoom(room, user, playerState) {
  await parseRequest(`/classes/MultiplayerRoom/${room.objectId}`, {
    method: 'PUT',
    sessionToken: user.sessionToken,
    body: { [`players.${user.objectId}`]: playerState },
  });
  return { ...room, players: { ...(room.players || {}), [user.objectId]: playerState } };
}

export async function joinOrCreateMultiplayerRoom({ user, roomCode }) {
  const code = normalizeRoomCode(roomCode);
  const playerState = buildPlayerState(user);
  const existing = await findRoom(code);

  if (existing) {
    const room = await upsertPlayerInRoom(existing, user, playerState);
    logBaaSEvent('4. MultiplayerRoom', 'PUT /classes/MultiplayerRoom', `"${user.username}" entrou na sala ${code}`);
    return room;
  }

  const body = {
    roomCode: code,
    status: 'ACTIVE',
    players: { [user.objectId]: playerState },
    ACL: { '*': { read: true, write: true } },
  };
  const created = await parseRequest('/classes/MultiplayerRoom', {
    method: 'POST',
    sessionToken: user.sessionToken,
    body,
  });
  logBaaSEvent('4. MultiplayerRoom', 'POST /classes/MultiplayerRoom', `Sala ${code} criada (${created.objectId})`);
  return { ...body, objectId: created.objectId };
}

export async function updateMultiplayerProgress({ user, roomState, score, currentQuestion, correctAnswers, status = 'PLAYING' }) {
  if (!roomState?.objectId) return roomState;
  const playerState = buildPlayerState(user, { score, currentQuestion, correctAnswers, status });
  try {
    const room = await upsertPlayerInRoom(roomState, user, playerState);
    logBaaSEvent('4. MultiplayerRoom', 'PUT (sync)', `${user.username}: ${score} pts (Q${currentQuestion})`);
    return room;
  } catch (err) {
    logBaaSEvent('4. MultiplayerRoom', 'Falha ao sincronizar', err.message, 'WARN');
    return roomState;
  }
}

/**
 * Escuta mudanças em tempo real:
 *  - LiveQuery (WebSocket) se VITE_BACK4APP_LIVEQUERY_URL estiver configurada;
 *  - Polling REST a cada 3s como garantia (funciona mesmo sem LiveQuery).
 */
export function subscribeRealtimeUpdates({ roomCode, onRoomUpdate, onScoreCreated }) {
  if (!isBack4AppConfigured) return () => {};

  const code = normalizeRoomCode(roomCode);
  let ws = null;

  if (BACK4APP.liveQueryUrl) {
    try {
      ws = new WebSocket(BACK4APP.liveQueryUrl);
      ws.onopen = () => {
        ws.send(JSON.stringify({ op: 'connect', applicationId: BACK4APP.appId, javascriptKey: BACK4APP.jsKey }));
        ws.send(JSON.stringify({ op: 'subscribe', requestId: 1, query: { className: 'MultiplayerRoom', where: { roomCode: code } } }));
        ws.send(JSON.stringify({ op: 'subscribe', requestId: 2, query: { className: 'GameScore', where: {} } }));
        logBaaSEvent('4. LiveQuery', 'WebSocket conectado', `Inscrito em MultiplayerRoom [${code}] e GameScore`);
      };
      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          if ((data.op === 'create' || data.op === 'update') && data.object) {
            if (data.requestId === 1) onRoomUpdate?.(data.object);
            if (data.requestId === 2) onScoreCreated?.(data.object);
          }
        } catch {
          // mensagem inválida: ignora
        }
      };
    } catch {
      ws = null;
    }
  }

  const poll = setInterval(async () => {
    try {
      const room = await findRoom(code);
      if (room) onRoomUpdate?.(room);
    } catch {
      // falha de rede momentânea
    }
  }, 3000);

  return () => {
    clearInterval(poll);
    ws?.close();
  };
}
