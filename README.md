# ☁️ CloudQuiz Arena — Cloud-Powered Multiplayer Mini-Game (Docker + BaaS)

**Universidade de Fortaleza (UNIFOR)**  
**Centro de Ciências Tecnológicas (CCT) — Ciência da Computação**  
**Disciplina:** Desenvolvimento de Software em Nuvem  
**Tema Escolhido:** CloudQuiz (Multiplayer Sincronizado)

---

## 📋 Visão Geral do Projeto

O **CloudQuiz Arena** é um mini-game web multiplayer sincronizado de perguntas e respostas sobre **Computação em Nuvem, Docker, CI/CD e Arquitetura de Software**. A aplicação foi projetada seguindo os modelos **IaaS, PaaS e BaaS**, integrando:

- **Frontend:** Aplicação SPA construída com **Vite + React 18**.
- **Backend as a Service (BaaS):** **Back4App (Parse Platform)** integrando **5 recursos da plataforma**:
  1. **Autenticação de Jogadores (`_User`):** Cadastro (`POST /users`), Login (`GET /login`), Logout (`POST /logout`) e controle de sessão (`X-Parse-Session-Token`).
  2. **Persistência de Dados (`Classes`):** Classes estruturadas `Question`, `GameScore` e `MultiplayerRoom` com relacionamentos via `Pointer`.
  3. **Segurança (`ACLs & CLPs`):** Regras de *Access Control List* por documento (`"*": { "read": true }` para leitura pública do ranking e escrita restrita ao `objectId` do próprio jogador autenticado).
  4. **Sincronização em Tempo Real (`LiveQuery / MultiplayerRoom`):** Sincronização instantânea de salas multiplayer e placar global via WebSockets (`Parse LiveQuery`) e eventos em tempo real.
  5. **Cloud Code Functions (`/functions/validateAndSaveScore`):** Validação *anti-cheat* da pontuação no servidor antes da gravação definitiva ([`cloud/main.js`](./cloud/main.js)).
- **Conteinerização e Orquestração (IaaS/PaaS):** `Dockerfile` *Multi-Stage* otimizado (`node:20-alpine` → `nginx:stable-alpine`) implantado em **VPS Linux na Oracle Cloud Infrastructure (OCI)** e gerenciado via **Portainer**.
- **Automação CI/CD e Testes Funcionais:** Pipeline automatizado no **GitHub Actions** ([`.github/workflows/ci-cd.yml`](./.github/workflows/ci-cd.yml)) executando testes funcionais no **Vitest** (`npm test`), validação de build (`npm run build`), publicação de imagem no GitHub Container Registry (`ghcr.io`) e disparo automático do **Webhook do Portainer**.

---

## 🚀 Como Executar Localmente

### 1. Pré-requisitos
- Node.js 20+ (ou Docker instalado)

### 2. Instalação e Execução em Modo Desenvolvimento
```bash
npm install
npm run dev
```
Acesse no navegador: `http://localhost:5173`

> **Dica de Teste Multiplayer Local:** Você pode abrir duas abas lado a lado em `http://localhost:5173`, clicar em **⚡ Demo Jogador 1** na primeira aba e **⚡ Demo Jogador 2** na segunda aba, entrar na mesma sala (`UNIFOR-01`) e assistir ao placar sincronizando em tempo real!

### 3. Executar os Testes Funcionais Automatizados (Vitest)
```bash
npm test
```

### 4. Testar Compilação de Produção (Vite Build)
```bash
npm run build
npm run preview
```

### 5. Executar via Docker (Multi-Stage Nginx)
```bash
docker build -t cloudquiz-baas:latest .
docker run -d -p 8080:80 --name cloudquiz-arena cloudquiz-baas:latest
```
Acesse em: `http://localhost:8080` (Healthcheck disponível em `http://localhost:8080/healthz`).

---

## 📂 Estrutura do Repositório

```text
cloudquiz-baas/
├── .github/
│   └── workflows/
│       └── ci-cd.yml                  # Pipeline CI/CD (Vitest + Vite Build + GHCR + Portainer Webhook)
├── cloud/
│   └── main.js                        # Cloud Code Function para o Back4App (validação anti-cheat e ACL)
├── docs/
│   └── ENTREGA_1_E_2_COMPLETO.md      # Documento Completo: Entrega 1 (Plano) + Entrega 2 (Relatório Técnico)
├── src/
│   ├── data/
│   │   └── defaultQuestions.js        # Banco de questões de Cloud Computing, Docker, BaaS e CI/CD
│   ├── services/
│   │   └── back4app.js                # Integração com os 5 recursos do Back4App + Telemetria ao vivo
│   ├── utils/
│   │   ├── gameRules.js               # Regras de cálculo de pontuação, vitória multiplayer e payload ACL
│   │   └── __tests__/
│   │       └── gameRules.test.js      # Suite de Testes Funcionais Automatizados (Vitest)
│   ├── App.jsx                        # Interface completa (Auth, Lobby Multiplayer, Quiz Arena, Ranking)
│   ├── main.jsx                       # Ponto de entrada React
│   └── styles.css                     # Estilização responsiva tema Cloud/DevOps
├── .dockerignore
├── .env.example                       # Exemplo de variáveis de ambiente do Back4App
├── Dockerfile                         # Build Multi-Stage otimizado (Node 20 Alpine -> Nginx Alpine)
├── docker-compose.yml                 # Stack pronta para implantação no Portainer (Oracle Cloud VPS)
├── nginx.conf                         # Configuração SPA + Gzip + /healthz
├── package.json
└── vite.config.js
```
