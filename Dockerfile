# Stage 1: Build
FROM node:20-slim AS build

WORKDIR /app

# Instalar dependências
COPY package*.json ./
RUN npm install

# Copiar o resto do código
COPY . .

# Argumentos de build
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY

# Build do projeto
RUN npm run build

# Stage 2: Run
FROM node:20-slim

WORKDIR /app

# Instalar dependências básicas


# Copiar os arquivos compilados (mantendo a estrutura client/server)
COPY --from=build /app/dist ./dist

# Instalar Wrangler globalmente
RUN npm install -g wrangler

# Definir o diretório de trabalho como dist/server (onde está o wrangler.json)
WORKDIR /app/dist/server

# Expor a porta 3000
EXPOSE 3000

# Rodar o servidor usando wrangler dev (modo worker com assets mapeados)
CMD ["wrangler", "dev", "--port", "3000", "--ip", "0.0.0.0", "--compatibility-date=2024-11-01", "--compatibility-flag=nodejs_compat"]
