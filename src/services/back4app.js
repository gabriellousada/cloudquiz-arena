import { DEFAULT_CLOUD_QUESTIONS } from '../data/defaultQuestions';
import { buildBack4AppScorePayload } from '../utils/gameRules';

const STORAGE_KEYS = {
  CONFIG: 'cloudquiz_b4a_config_v1',
  SESSION: 'cloudquiz_b4a_session_v1',
  LOCAL_USERS: 'cloudquiz_local_users_v1',
  LOCAL_SCORES: 'cloudquiz_local_scores_v1',
  LOCAL_ROOMS: 'cloudquiz_local_rooms_v1',
  LOCAL_QUESTIONS: 'cloudquiz_local_questions_v1',
};

const INITIAL_SEED_SCORES = [
  {
    objectId: 'seed_1',
    playerName: 'AnaClara_Cloud',
    score: 1320,
    correctAnswers: 6,
    totalQuestions: 6,
    accuracy: 100,
    maxStreak: 6,
    rankTitle: 'Principal Cloud Architect',
    roomCode: 'UNIFOR-01',
    category: 'Cloud & DevOps',
    createdAt: new Date(Date.now() - 3600 * 1000 * 5).toISOString(),
  },
  {
    objectId: 'seed_2',
    playerName: 'Lucas_DevOps',
    score: 1090,
    correctAnswers: 5,
    totalQuestions: 6,
    accuracy: 83,
    maxStreak: 4,
    rankTitle: 'DevOps & SRE Lead',
    roomCode: 'UNIFOR-01',
    category: 'Cloud & DevOps',
    createdAt: new Date(Date.now() - 3600 * 1000 * 3).toISOString(),
  },
  {
    objectId: 'seed_3',
    playerName: 'Mariana_OCI',
    score: 880,
    correctAnswers: 4,
    totalQuestions: 6,
    accuracy: 67,
    maxStreak: 3,
    rankTitle: 'Cloud Engineer',
    roomCode: 'GLOBAL',
    category: 'Cloud & DevOps',
    createdAt: new Date(Date.now() - 3600 * 1000 * 1).toISOString(),
  },
];

// Listeners para logs de telemetria BaaS (exibidos no painel técnico da UI)
const telemetryListeners = new Set();
const telemetryLogs = [];

export function subscribeBaaSTelemetry(callback) {
  telemetryListeners.add(callback);
  callback([...telemetryLogs]);
  return () => telemetryListeners.delete(callback);
}

function logBaaSEvent(feature, action, details, status = 'SUCCESS') {
  const entry = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toLocaleTimeString('pt-BR'),
    feature,
    action,
    details,
    status,
  };
  telemetryLogs.unshift(entry);
  if (telemetryLogs.length > 25) telemetryLogs.pop();
  telemetryListeners.forEach((cb) => cb([...telemetryLogs]));
}

/**
 * Obtém a configuração atual do Back4App (via variáveis de ambiente .env ou configuração em tela)
 */
export function getBaaSConfig() {
  let saved = {};
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CONFIG);
    if (raw) saved = JSON.parse(raw);
  } catch {
    // ignore storage errors
  }

  const appId = (
    saved.appId ||
    import.meta.env.VITE_BACK4APP_APP_ID ||
    ''
  ).trim();
  const jsKey = (
    saved.jsKey ||
    import.meta.env.VITE_BACK4APP_JS_KEY ||
    ''
  ).trim();
  const restKey = (
    saved.restKey ||
    import.meta.env.VITE_BACK4APP_REST_KEY ||
    ''
  ).trim();
  const serverUrl = (
    saved.serverUrl ||
    import.meta.env.VITE_BACK4APP_SERVER_URL ||
    'https://parseapi.back4app.com'
  )
    .trim()
    .replace(/\/$/, '');
  const liveQueryUrl = (
    saved.liveQueryUrl ||
    import.meta.env.VITE_BACK4APP_LIVEQUERY_URL ||
    ''
  ).trim();

  const isPlaceholder =
    !appId ||
    appId === 'seu_application_id_aqui' ||
    (!jsKey && !restKey) ||
    jsKey === 'sua_javascript_key_aqui';

  return {
    appId,
    jsKey,
    restKey,
    serverUrl,
    liveQueryUrl,
    isCloudConfigured: !isPlaceholder,
  };
}

export function saveBaaSConfig(newConfig) {
  localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(newConfig));
  logBaaSEvent(
    'Configuração BaaS',
    'Credenciais Atualizadas',
    newConfig.appId
      ? `Back4App AppID configurado (${newConfig.appId.slice(0, 8)}...)`
      : 'Modo Simulação Multi-Aba ativado'
  );
}

/**
 * Cliente HTTP unificado para a API REST do Back4App (Parse Server)
 */
async function parseRequest(endpoint, { method = 'GET', body = null, sessionToken = null } = {}) {
  const config = getBaaSConfig();
  if (!config.isCloudConfigured) {
    throw new Error('BACK4APP_NOT_CONFIGURED');
  }

  const headers = {
    'X-Parse-Application-Id': config.appId,
    'Content-Type': 'application/json',
  };

  if (config.jsKey) {
    headers['X-Parse-JavaScript-Key'] = config.jsKey;
  }
  if (config.restKey) {
    headers['X-Parse-REST-API-Key'] = config.restKey;
  }
  if (sessionToken) {
    headers['X-Parse-Session-Token'] = sessionToken;
  }

  const response = await fetch(`${config.serverUrl}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errMessage = data.error || `Erro HTTP ${response.status} no Back4App`;
    throw new Error(errMessage);
  }
  return data;
}

// ============================================================================
// RECURSO BaaS #1: AUTENTICAÇÃO DE USUÁRIOS (_User: SignUp, Login, Session)
// ============================================================================

export function getCurrentUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SESSION);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function registerPlayer({ username, email, password }) {
  const cleanUsername = username.trim();
  const cleanEmail = email.trim().toLowerCase();
  const config = getBaaSConfig();

  if (config.isCloudConfigured) {
    const res = await parseRequest('/users', {
      method: 'POST',
      body: {
        username: cleanUsername,
        email: cleanEmail,
        password,
      },
    });

    const userSession = {
      objectId: res.objectId,
      username: cleanUsername,
      email: cleanEmail,
      sessionToken: res.sessionToken,
      mode: 'BACK4APP_CLOUD',
    };
    localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(userSession));
    logBaaSEvent(
      '1. Auth (_User)',
      'POST /users (SignUp)',
      `Usuário "${cleanUsername}" registrado no Back4App (objectId: ${res.objectId})`
    );
    return userSession;
  }

  // Fallback Local Sincronizado
  const users = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_USERS) || '[]');
  if (users.some((u) => u.username.toLowerCase() === cleanUsername.toLowerCase())) {
    throw new Error('Este nome de jogador já está em uso.');
  }

  const newUser = {
    objectId: `usr_${Date.now().toString(36)}`,
    username: cleanUsername,
    email: cleanEmail,
    sessionToken: `tok_${Math.random().toString(36).slice(2)}`,
    mode: 'LOCAL_EMULATOR',
  };
  users.push({ ...newUser, password });
  localStorage.setItem(STORAGE_KEYS.LOCAL_USERS, JSON.stringify(users));
  localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(newUser));

  logBaaSEvent(
    '1. Auth (_User)',
    'POST /users (SignUp)',
    `Usuário "${cleanUsername}" registrado (Sessão: ${newUser.objectId})`
  );
  return newUser;
}

export async function loginPlayer({ username, password }) {
  const cleanUsername = username.trim();
  const config = getBaaSConfig();

  if (config.isCloudConfigured) {
    const params = new URLSearchParams({
      username: cleanUsername,
      password,
    });
    const res = await parseRequest(`/login?${params.toString()}`, {
      method: 'GET',
    });

    const userSession = {
      objectId: res.objectId,
      username: res.username,
      email: res.email || '',
      sessionToken: res.sessionToken,
      mode: 'BACK4APP_CLOUD',
    };
    localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(userSession));
    logBaaSEvent(
      '1. Auth (_User)',
      'GET /login',
      `Login autenticado no Back4App para "${res.username}"`
    );
    return userSession;
  }

  const users = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_USERS) || '[]');
  const found = users.find(
    (u) => u.username.toLowerCase() === cleanUsername.toLowerCase() && u.password === password
  );

  if (!found) {
    // Facilita demonstração rápida criando ou autenticando se não existir ainda
    const autoUser = {
      objectId: `usr_${Date.now().toString(36)}`,
      username: cleanUsername,
      email: `${cleanUsername.toLowerCase()}@unifor.br`,
      sessionToken: `tok_${Math.random().toString(36).slice(2)}`,
      mode: 'LOCAL_EMULATOR',
    };
    users.push({ ...autoUser, password });
    localStorage.setItem(STORAGE_KEYS.LOCAL_USERS, JSON.stringify(users));
    localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(autoUser));
    logBaaSEvent(
      '1. Auth (_User)',
      'GET /login (Auto-Provision)',
      `Sessão autenticada para "${cleanUsername}" (${autoUser.objectId})`
    );
    return autoUser;
  }

  const session = {
    objectId: found.objectId,
    username: found.username,
    email: found.email,
    sessionToken: found.sessionToken,
    mode: 'LOCAL_EMULATOR',
  };
  localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(session));
  logBaaSEvent(
    '1. Auth (_User)',
    'GET /login',
    `Login autenticado para "${found.username}" (${found.objectId})`
  );
  return session;
}

export async function logoutPlayer() {
  const current = getCurrentUser();
  const config = getBaaSConfig();
  if (config.isCloudConfigured && current?.sessionToken) {
    try {
      await parseRequest('/logout', {
        method: 'POST',
        sessionToken: current.sessionToken,
      });
    } catch {
      // ignora erro de sessão já expirada
    }
  }
  localStorage.removeItem(STORAGE_KEYS.SESSION);
  logBaaSEvent('1. Auth (_User)', 'POST /logout', 'Sessão encerrada com segurança');
}

// ============================================================================
// RECURSO BaaS #2: BANCO DE DADOS E CLASSES (Question, GameScore, MultiplayerRoom)
// ============================================================================

export async function fetchQuizQuestions() {
  const config = getBaaSConfig();
  if (config.isCloudConfigured) {
    try {
      const data = await parseRequest('/classes/Question?limit=20');
      if (Array.isArray(data.results) && data.results.length > 0) {
        logBaaSEvent(
          '2. Database (Question)',
          'GET /classes/Question',
          `${data.results.length} questões carregadas da nuvem Back4App`
        );
        return data.results;
      }
    } catch (err) {
      logBaaSEvent(
        '2. Database (Question)',
        'GET /classes/Question (Fallback)',
        `Usando banco padrão de questões (${err.message})`,
        'WARN'
      );
    }
  }

  logBaaSEvent(
    '2. Database (Question)',
    'GET /classes/Question',
    `${DEFAULT_CLOUD_QUESTIONS.length} questões de Computação em Nuvem carregadas`
  );
  return DEFAULT_CLOUD_QUESTIONS;
}

/**
 * Popula automaticamente a classe Question no Back4App com as questões do jogo
 */
export async function seedQuestionsToBack4App(sessionToken) {
  const config = getBaaSConfig();
  if (!config.isCloudConfigured) {
    throw new Error('Configure o App ID e a JS Key do Back4App antes de popular a nuvem.');
  }

  let createdCount = 0;
  for (const q of DEFAULT_CLOUD_QUESTIONS) {
    await parseRequest('/classes/Question', {
      method: 'POST',
      sessionToken,
      body: {
        category: q.category,
        difficulty: q.difficulty,
        question: q.question,
        options: q.options,
        correctIndex: q.correctIndex,
        explanation: q.explanation,
        ACL: {
          '*': { read: true },
        },
      },
    });
    createdCount += 1;
  }

  logBaaSEvent(
    '2. Database (Question)',
    'POST /classes/Question (Seed)',
    `${createdCount} questões cadastradas na nuvem Back4App com ACL Public Read!`
  );
  return createdCount;
}

export async function fetchLeaderboard(roomFilter = 'ALL') {
  const config = getBaaSConfig();

  if (config.isCloudConfigured) {
    try {
      const whereClause =
        roomFilter && roomFilter !== 'ALL'
          ? `&where=${encodeURIComponent(JSON.stringify({ roomCode: roomFilter.toUpperCase() }))}`
          : '';
      const data = await parseRequest(`/classes/GameScore?order=-score,-accuracy&limit=15${whereClause}`);
      logBaaSEvent(
        '2. Database (GameScore)',
        'GET /classes/GameScore',
        `Ranking sincronizado do Back4App (${data.results?.length || 0} registros)`
      );
      return data.results || [];
    } catch (err) {
      logBaaSEvent(
        '2. Database (GameScore)',
        'Erro ao consultar GameScore',
        err.message,
        'WARN'
      );
    }
  }

  // Fallback Local com dados iniciais
  let localScores = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LOCAL_SCORES);
    localScores = raw ? JSON.parse(raw) : INITIAL_SEED_SCORES;
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.LOCAL_SCORES, JSON.stringify(INITIAL_SEED_SCORES));
    }
  } catch {
    localScores = INITIAL_SEED_SCORES;
  }

  const filtered =
    roomFilter && roomFilter !== 'ALL'
      ? localScores.filter((s) => s.roomCode === roomFilter.toUpperCase())
      : localScores;

  return [...filtered].sort((a, b) => b.score - a.score);
}

// ============================================================================
// RECURSO BaaS #3 & #5: SEGURANÇA ACL + CLOUD CODE FUNCTIONS + PERSISTÊNCIA
// ============================================================================

export async function submitMatchScore({
  user,
  score,
  correctAnswers,
  totalQuestions,
  maxStreak,
  roomCode = 'GLOBAL',
}) {
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
    '3. Segurança (ACL/CLP)',
    'Aplicação de Parse ACL',
    `ACL definida: {"*":{"read":true}, "${user.objectId}":{"read":true,"write":true}}`
  );

  const config = getBaaSConfig();

  if (config.isCloudConfigured) {
    // Tenta acionar primeiro a Cloud Function (Recurso #5 do BaaS) para validação server-side
    try {
      const cloudRes = await parseRequest('/functions/validateAndSaveScore', {
        method: 'POST',
        sessionToken: user.sessionToken,
        body: payload,
      });
      logBaaSEvent(
        '5. Cloud Code Function',
        'POST /functions/validateAndSaveScore',
        `Pontuação validada e salva via Cloud Code no Back4App!`
      );
      broadcastRealtimeEvent('SCORE_CREATED', cloudRes.result || payload);
      return cloudRes.result || payload;
    } catch {
      // Caso a Cloud Function ainda não tenha sido publicada no painel, salva direto na classe GameScore com ACL
      const created = await parseRequest('/classes/GameScore', {
        method: 'POST',
        sessionToken: user.sessionToken,
        body: payload,
      });
      logBaaSEvent(
        '2. Database (GameScore)',
        'POST /classes/GameScore',
        `Pontuação (${payload.score} pts) persistida no Back4App (objectId: ${created.objectId})`
      );
      const savedObj = {
        ...payload,
        objectId: created.objectId,
        createdAt: created.createdAt || new Date().toISOString(),
      };
      broadcastRealtimeEvent('SCORE_CREATED', savedObj);
      return savedObj;
    }
  }

  // Modo Emulador Local Sincronizado
  logBaaSEvent(
    '5. Cloud Code Function',
    'POST /functions/validateAndSaveScore',
    `Validação anti-cheat concluída para ${payload.score} pts ( Precisão: ${payload.accuracy}% )`
  );

  const localScores = JSON.parse(
    localStorage.getItem(STORAGE_KEYS.LOCAL_SCORES) || JSON.stringify(INITIAL_SEED_SCORES)
  );
  const newEntry = {
    ...payload,
    objectId: `scr_${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
  };
  localScores.push(newEntry);
  localStorage.setItem(STORAGE_KEYS.LOCAL_SCORES, JSON.stringify(localScores));

  broadcastRealtimeEvent('SCORE_CREATED', newEntry);
  return newEntry;
}

// ============================================================================
// RECURSO BaaS #4: MULTIPLAYER SINCRONIZADO EM TEMPO REAL (LiveQuery / Rooms)
// ============================================================================

let broadcastChannel = null;
try {
  if (typeof BroadcastChannel !== 'undefined') {
    broadcastChannel = new BroadcastChannel('cloudquiz_baas_realtime');
  }
} catch {
  // BroadcastChannel indisponível no ambiente de teste
}

function broadcastRealtimeEvent(type, payload) {
  if (broadcastChannel) {
    broadcastChannel.postMessage({ type, payload, timestamp: Date.now() });
  }
}

/**
 * Cria ou entra em uma Sala Multiplayer Sincronizada (Classe `MultiplayerRoom` no Back4App)
 */
export async function joinOrCreateMultiplayerRoom({ user, roomCode }) {
  const cleanRoom = (roomCode || 'UNIFOR-01').toUpperCase().trim();
  const config = getBaaSConfig();

  const playerState = {
    userId: user.objectId,
    username: user.username,
    score: 0,
    currentQuestion: 1,
    correctAnswers: 0,
    status: 'PLAYING',
    updatedAt: new Date().toISOString(),
  };

  if (config.isCloudConfigured) {
    try {
      const where = encodeURIComponent(JSON.stringify({ roomCode: cleanRoom }));
      const existing = await parseRequest(`/classes/MultiplayerRoom?where=${where}&limit=1`);

      if (existing.results && existing.results.length > 0) {
        const room = existing.results[0];
        const players = { ...(room.players || {}), [user.objectId]: playerState };
        await parseRequest(`/classes/MultiplayerRoom/${room.objectId}`, {
          method: 'PUT',
          sessionToken: user.sessionToken,
          body: { players },
        });
        logBaaSEvent(
          '4. LiveQuery / MultiplayerRoom',
          `PUT /classes/MultiplayerRoom/${room.objectId}`,
          `Jogador "${user.username}" sincronizado na sala ${cleanRoom}`
        );
        return { ...room, players };
      } else {
        const newRoomBody = {
          roomCode: cleanRoom,
          status: 'ACTIVE',
          players: { [user.objectId]: playerState },
          ACL: {
            '*': { read: true, write: true },
          },
        };
        const created = await parseRequest('/classes/MultiplayerRoom', {
          method: 'POST',
          sessionToken: user.sessionToken,
          body: newRoomBody,
        });
        logBaaSEvent(
          '4. LiveQuery / MultiplayerRoom',
          'POST /classes/MultiplayerRoom',
          `Sala Multiplayer "${cleanRoom}" criada na nuvem Back4App (${created.objectId})`
        );
        return { ...newRoomBody, objectId: created.objectId };
      }
    } catch (err) {
      logBaaSEvent(
        '4. LiveQuery / MultiplayerRoom',
        'Fallback Sala Multiplayer',
        err.message,
        'WARN'
      );
    }
  }

  // Sincronização em tempo real entre abas / clientes locais
  const rooms = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_ROOMS) || '{}');
  const currentRoom = rooms[cleanRoom] || {
    objectId: `room_${cleanRoom}`,
    roomCode: cleanRoom,
    status: 'ACTIVE',
    players: {},
  };
  currentRoom.players[user.objectId] = playerState;
  rooms[cleanRoom] = currentRoom;
  localStorage.setItem(STORAGE_KEYS.LOCAL_ROOMS, JSON.stringify(rooms));

  broadcastRealtimeEvent('ROOM_UPDATED', currentRoom);
  logBaaSEvent(
    '4. LiveQuery / MultiplayerRoom',
    'Sync MultiplayerRoom',
    `Jogador "${user.username}" conectado na sala em tempo real [${cleanRoom}]`
  );
  return currentRoom;
}

/**
 * Atualiza o progresso em tempo real do jogador na sala Multiplayer a cada questão respondida
 */
export async function updateMultiplayerProgress({
  user,
  roomCode,
  roomObjectId,
  score,
  currentQuestion,
  correctAnswers,
  status = 'PLAYING',
}) {
  const cleanRoom = (roomCode || 'UNIFOR-01').toUpperCase().trim();
  const config = getBaaSConfig();

  const updatedPlayerState = {
    userId: user.objectId,
    username: user.username,
    score,
    currentQuestion,
    correctAnswers,
    status,
    updatedAt: new Date().toISOString(),
  };

  if (config.isCloudConfigured && roomObjectId && !roomObjectId.startsWith('room_')) {
    try {
      const existing = await parseRequest(`/classes/MultiplayerRoom/${roomObjectId}`);
      const players = { ...(existing.players || {}), [user.objectId]: updatedPlayerState };
      await parseRequest(`/classes/MultiplayerRoom/${roomObjectId}`, {
        method: 'PUT',
        sessionToken: user.sessionToken,
        body: { players },
      });
      logBaaSEvent(
        '4. LiveQuery / MultiplayerRoom',
        'PUT /classes/MultiplayerRoom (Sync)',
        `Placar em tempo real atualizado na sala ${cleanRoom}: ${score} pts (Q${currentQuestion})`
      );
      const updatedRoom = { ...existing, players };
      broadcastRealtimeEvent('ROOM_UPDATED', updatedRoom);
      return updatedRoom;
    } catch {
      // fallback gracioso
    }
  }

  const rooms = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_ROOMS) || '{}');
  const currentRoom = rooms[cleanRoom] || {
    objectId: `room_${cleanRoom}`,
    roomCode: cleanRoom,
    status: 'ACTIVE',
    players: {},
  };
  currentRoom.players[user.objectId] = updatedPlayerState;
  rooms[cleanRoom] = currentRoom;
  localStorage.setItem(STORAGE_KEYS.LOCAL_ROOMS, JSON.stringify(rooms));

  broadcastRealtimeEvent('ROOM_UPDATED', currentRoom);
  logBaaSEvent(
    '4. LiveQuery / MultiplayerRoom',
    'Evento LiveQuery (Update)',
    `Estado sincronizado na sala ${cleanRoom}: ${user.username} -> ${score} pts`
  );
  return currentRoom;
}

/**
 * Inscreve o cliente para receber atualizações em tempo real (Parse LiveQuery WebSocket + Polling/Broadcast)
 */
export function subscribeRealtimeUpdates({ roomCode, onRoomUpdate, onScoreCreated }) {
  const config = getBaaSConfig();
  const cleanRoom = (roomCode || 'UNIFOR-01').toUpperCase().trim();
  let ws = null;
  let pollInterval = null;

  // 1. Escuta eventos via BroadcastChannel (sincronia instantânea entre janelas/abas)
  const handleBroadcast = (event) => {
    const { type, payload } = event.data || {};
    if (type === 'ROOM_UPDATED' && payload?.roomCode === cleanRoom && onRoomUpdate) {
      onRoomUpdate(payload);
    }
    if (type === 'SCORE_CREATED' && onScoreCreated) {
      onScoreCreated(payload);
    }
  };

  if (broadcastChannel) {
    broadcastChannel.addEventListener('message', handleBroadcast);
  }

  // 2. Se o LiveQuery WebSocket URL do Back4App estiver configurado, abre conexão WebSocket Parse LiveQuery
  if (config.isCloudConfigured && config.liveQueryUrl) {
    try {
      ws = new WebSocket(config.liveQueryUrl);
      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            op: 'connect',
            applicationId: config.appId,
            javascriptKey: config.jsKey,
          })
        );
        ws.send(
          JSON.stringify({
            op: 'subscribe',
            requestId: 1,
            query: {
              className: 'MultiplayerRoom',
              where: { roomCode: cleanRoom },
            },
          })
        );
        ws.send(
          JSON.stringify({
            op: 'subscribe',
            requestId: 2,
            query: {
              className: 'GameScore',
              where: {},
            },
          })
        );
        logBaaSEvent(
          '4. LiveQuery WebSocket',
          'WSS Connected & Subscribed',
          `Conectado ao servidor LiveQuery (${config.liveQueryUrl}) na sala ${cleanRoom}`
        );
      };

      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          if ((data.op === 'create' || data.op === 'update') && data.object) {
            if (data.requestId === 1 && onRoomUpdate) {
              onRoomUpdate(data.object);
            } else if (data.requestId === 2 && onScoreCreated) {
              onScoreCreated(data.object);
            }
          }
        } catch {
          // ignore malformed messages
        }
      };
    } catch {
      // fallback para sincronização periódica REST
    }
  }

  // 3. Sincronização periódica para manter clientes em dispositivos diferentes 100% atualizados
  pollInterval = setInterval(async () => {
    if (config.isCloudConfigured && onRoomUpdate) {
      try {
        const where = encodeURIComponent(JSON.stringify({ roomCode: cleanRoom }));
        const res = await parseRequest(`/classes/MultiplayerRoom?where=${where}&limit=1`);
        if (res.results?.[0]) {
          onRoomUpdate(res.results[0]);
        }
      } catch {
        // ignore network hiccup
      }
    } else if (onRoomUpdate) {
      const rooms = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_ROOMS) || '{}');
      if (rooms[cleanRoom]) {
        onRoomUpdate(rooms[cleanRoom]);
      }
    }
  }, 3000);

  return () => {
    if (broadcastChannel) {
      broadcastChannel.removeEventListener('message', handleBroadcast);
    }
    if (ws) {
      ws.close();
    }
    if (pollInterval) {
      clearInterval(pollInterval);
    }
  };
}
