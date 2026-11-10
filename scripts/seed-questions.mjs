/**
 * Popula a classe `Question` no Back4App com as questões padrão do jogo.
 *
 * Uso (Node 20.6+):
 *   npm run seed
 *
 * Requer no arquivo .env:
 *   VITE_BACK4APP_APP_ID=...
 *   BACK4APP_MASTER_KEY=...   (NUNCA use prefixo VITE_ — a Master Key não pode ir para o frontend)
 */
import { DEFAULT_CLOUD_QUESTIONS } from '../src/data/defaultQuestions.js';

const appId = process.env.VITE_BACK4APP_APP_ID;
const masterKey = process.env.BACK4APP_MASTER_KEY;
const serverUrl = (process.env.VITE_BACK4APP_SERVER_URL || 'https://parseapi.back4app.com').replace(/\/$/, '');

if (!appId || !masterKey) {
  console.error('❌ Defina VITE_BACK4APP_APP_ID e BACK4APP_MASTER_KEY no arquivo .env');
  process.exit(1);
}

const headers = {
  'X-Parse-Application-Id': appId,
  'X-Parse-Master-Key': masterKey,
  'Content-Type': 'application/json',
};

const countRes = await fetch(`${serverUrl}/classes/Question?count=1&limit=0`, { headers });
const { count = 0 } = await countRes.json();

if (count > 0) {
  console.log(`ℹ️ A classe Question já possui ${count} questões. Nada a fazer.`);
  process.exit(0);
}

for (const q of DEFAULT_CLOUD_QUESTIONS) {
  const res = await fetch(`${serverUrl}/classes/Question`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      category: q.category,
      difficulty: q.difficulty,
      question: q.question,
      options: q.options,
      correctIndex: q.correctIndex,
      explanation: q.explanation,
      ACL: { '*': { read: true } }, // leitura pública, escrita só com Master Key
    }),
  });
  if (!res.ok) {
    console.error('❌ Erro ao criar questão:', await res.text());
    process.exit(1);
  }
}

console.log(`✅ ${DEFAULT_CLOUD_QUESTIONS.length} questões criadas na classe Question do Back4App.`);
