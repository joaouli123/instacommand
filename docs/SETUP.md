# InstaCommand — Guia de Instalação

## Pré-requisitos

- **Node.js** 20+ ([download](https://nodejs.org))
- **Docker** e **Docker Compose** ([download](https://docker.com))
- **Meta Developer Account** ([criar](https://developers.facebook.com/))

## 1. Clone e Configure

```bash
# Clone o repositório
cd Instagram

# Copie o arquivo de variáveis de ambiente
cp .env.example .env

# Edite o .env com suas configurações
# (veja META_APP_SETUP.md para configurar o Meta App)
```

## 2. Inicie os Serviços (PostgreSQL + Redis)

```bash
docker-compose up -d
```

Verifique se estão rodando:
```bash
docker-compose ps
```

## 3. Backend

```bash
cd backend

# Instale as dependências
npm install

# Gere o Prisma Client
npm run prisma:generate

# Execute as migrations do banco
npm run prisma:migrate

# (Opcional) Abra o Prisma Studio para visualizar o banco
npm run prisma:studio

# Inicie o servidor de desenvolvimento
npm run dev
```

O backend estará rodando em `http://localhost:3001`

## 4. Frontend

```bash
cd frontend

# Instale as dependências
npm install

# Inicie o servidor de desenvolvimento
npm run dev
```

O frontend estará rodando em `http://localhost:3000`

## 5. Verificação

1. Acesse `http://localhost:3000` no navegador
2. Clique em "Entrar com Facebook"
3. Autorize o app e selecione suas páginas/contas IG
4. O dashboard deve carregar com seus dados

## Troubleshooting

| Problema | Solução |
|----------|---------|
| Docker não inicia | Verifique se Docker Desktop está rodando |
| Erro de conexão com DB | Verifique DB_HOST e DB_PORT no .env |
| Erro de token | Reconfigure META_APP_ID e META_APP_SECRET |
| Erro 429 (rate limit) | Aguarde e tente novamente, a API tem limites |
