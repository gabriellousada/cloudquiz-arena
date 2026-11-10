# ☁️ CloudQuiz Arena — Quiz Multiplayer com Vercel + Back4App

**UNIFOR — Desenvolvimento de Software em Nuvem — Trabalho Final**

Mini-game de perguntas e respostas sobre Computação em Nuvem com **salas multiplayer sincronizadas** e **ranking global**.

| Camada | Tecnologia |
| :--- | :--- |
| Frontend | React 18 + Vite (hospedado na **Vercel**) |
| Backend (BaaS) | **Back4App** (Parse Server) |
| CI | GitHub Actions (Vitest + build) |
| CD | Integração Git da Vercel (produção na `main`, preview em PRs) |

### Recursos do Back4App utilizados
1. **Autenticação** — classe `_User` (cadastro, login, logout, session token).
2. **Banco de dados** — classes `Question`, `GameScore`, `MultiplayerRoom`.
3. **Segurança** — ACL em cada `GameScore` (leitura pública, escrita só do dono) + CLPs.
4. **Tempo real** — sala `MultiplayerRoom` sincronizada (LiveQuery via WebSocket + polling de garantia).
5. **Cloud Code** — função `validateAndSaveScore` com validação anti-cheat ([cloud/main.js](./cloud/main.js)).

---

## 1. Rodar localmente

```bash
npm install
cp .env.example .env      # preencha com as chaves do Back4App
npm run dev               # http://localhost:5173
npm test                  # testes funcionais (Vitest)
```

## 2. Configurar o Back4App (uma vez)

1. Crie um app em https://www.back4app.com → **App Settings → Security & Keys** e copie
   `Application ID`, `JavaScript Key` e `Master Key` para o `.env`.
2. **Popular as questões:** `npm run seed` (usa a Master Key só localmente — ela nunca vai para o frontend).
3. **Cloud Code:** em **Cloud Code → Functions**, cole o conteúdo de [`cloud/main.js`](./cloud/main.js) e clique em **Deploy**.
   *(Opcional: sem ela, o jogo salva direto na classe `GameScore` com a mesma ACL.)*
4. **Permissões (Database → classe → Security / CLP):**
   | Classe | CLP recomendada |
   | :--- | :--- |
   | `Question` | Public: **Read** apenas |
   | `GameScore` | Public: Read · Authenticated: Create/Update |
   | `MultiplayerRoom` | Public: Read · Authenticated: Create/Update |
5. **(Opcional) Tempo real via LiveQuery:** **Server Settings → Web Hosting and Live Query** → ative o subdomínio, habilite LiveQuery para `MultiplayerRoom` e `GameScore` e defina `VITE_BACK4APP_LIVEQUERY_URL=wss://SEU_SUBDOMINIO.b4a.io`.
   Sem isso, a sala sincroniza por polling a cada 3s.

## 3. Deploy na Vercel

1. Suba o projeto para um repositório no GitHub.
2. Em https://vercel.com/new importe o repositório (a Vercel detecta **Vite** automaticamente; `vercel.json` já está pronto).
3. Em **Settings → Environment Variables** adicione:
   - `VITE_BACK4APP_APP_ID`
   - `VITE_BACK4APP_JS_KEY`
   - `VITE_BACK4APP_SERVER_URL` = `https://parseapi.back4app.com`
   - `VITE_BACK4APP_LIVEQUERY_URL` *(opcional)*
   > ⚠️ **Não** adicione a `BACK4APP_MASTER_KEY` na Vercel.
4. Clique em **Deploy**. A partir daí, todo `push` na `main` publica em produção e cada PR ganha uma URL de preview.

> Variáveis `VITE_*` são embutidas no build: ao alterá-las, faça **Redeploy**.

Alternativa via CLI: `npx vercel` (preview) e `npx vercel --prod` (produção).

---

## Estrutura

```text
cloudquiz-baas/
├── .github/workflows/ci-cd.yml   # CI: Vitest + build
├── cloud/main.js                 # Cloud Code (Back4App)
├── docs/ENTREGA_1_E_2_COMPLETO.md
├── scripts/seed-questions.mjs    # Popula a classe Question
├── src/
│   ├── data/defaultQuestions.js
│   ├── services/back4app.js      # Toda a integração com o Back4App
│   ├── utils/gameRules.js        # Regras de pontuação/vitória + payload ACL
│   ├── utils/__tests__/gameRules.test.js
│   ├── App.jsx · main.jsx · styles.css
├── .env.example
├── vercel.json
└── package.json
```

## Fluxo

```text
[Dev] -> [GitHub Push/PR] -> [GitHub Actions: testes + build] 
                          -> [Vercel: build + deploy (preview/produção)] -> [App no ar] <-> [Back4App]
```
