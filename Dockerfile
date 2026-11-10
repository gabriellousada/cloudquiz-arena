# ==============================================================================
# ESTÁGIO 1: Build da Aplicação Frontend (Vite + React)
# ==============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copia os manifestos de dependências primeiro para aproveitar cache de camadas Docker
COPY package*.json ./

# Instala as dependências de forma determinística
RUN npm ci

# Copia o restante do código-fonte da aplicação
COPY . .

# Argumentos de build opcionais para injetar credenciais do Back4App em tempo de compilação
ARG VITE_BACK4APP_APP_ID=""
ARG VITE_BACK4APP_JS_KEY=""
ARG VITE_BACK4APP_SERVER_URL="https://parseapi.back4app.com"
ARG VITE_BACK4APP_LIVEQUERY_URL=""

ENV VITE_BACK4APP_APP_ID=${VITE_BACK4APP_APP_ID}
ENV VITE_BACK4APP_JS_KEY=${VITE_BACK4APP_JS_KEY}
ENV VITE_BACK4APP_SERVER_URL=${VITE_BACK4APP_SERVER_URL}
ENV VITE_BACK4APP_LIVEQUERY_URL=${VITE_BACK4APP_LIVEQUERY_URL}

# Compila os arquivos estáticos de produção na pasta /app/dist
RUN npm run build

# ==============================================================================
# ESTÁGIO 2: Servidor Web de Produção Leve (Nginx Alpine)
# ==============================================================================
FROM nginx:stable-alpine AS production

# Copia configuração customizada do Nginx (suporte a SPA e compressão Gzip)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copia os artefatos estáticos compilados pelo Vite no Estágio 1
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

# Healthcheck nativo para monitoramento de status no Portainer (Oracle Cloud VPS)
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
