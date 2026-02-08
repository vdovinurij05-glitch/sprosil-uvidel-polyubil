# Спросил, увидел, полюбил

Дейтинг мини-приложение для Telegram. Игровая механика "вопрос-ответ-выбор" вместо свайпов.

## Стек

- **Клиент:** React + Vite + TypeScript + Telegram WebApp SDK
- **Сервер:** Node.js + Express + Socket.IO + TypeScript
- **БД:** PostgreSQL + Prisma ORM
- **Инфра:** Docker Compose

## Быстрый старт

### 1. Создай Telegram-бота

Через [@BotFather](https://t.me/BotFather):
- `/newbot` → получи токен
- `/setmenubutton` → укажи URL WebApp

### 2. Настрой окружение

```bash
cp .env.example .env
# Впиши BOT_TOKEN
```

### 3. Запуск через Docker Compose

```bash
docker compose up --build
```

### 4. Запуск локально (без Docker)

```bash
# Терминал 1: БД
docker run -d --name sprosil-db -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=sprosil_db postgres:16-alpine

# Терминал 2: Сервер
cd server
npm install
npx prisma migrate dev --name init
npm run dev

# Терминал 3: Клиент
cd client
npm install
npm run dev
```

## Архитектура

### Пользовательский сценарий

1. **Старт** → Пользователь задаёт вопрос
2. **Лобби** → Ожидание 3М + 3Ж (мин. 2+2, таймаут 90сек)
3. **Визуализация состава** → Показ всех участников
4. **Раунды Q&A** → Вопросы по очереди, ответы параллельно
5. **Голосование** → Выбор лучшего ответа
6. **Результаты** → Взаимные матчи, контакты

### Механика матча

По всем раундам подсчитывается, за кого каждый участник голосовал чаще всего.
Если A чаще голосовал за B, и B чаще голосовал за A → **это матч**.

### Структура БД

| Таблица | Назначение |
|---------|-----------|
| `users` | Telegram-профили, пол |
| `sessions` | Игровые сессии (lobby → results) |
| `session_participants` | Связь пользователь-сессия |
| `questions` | Вопросы участников |
| `answers` | Ответы на вопросы |
| `votes` | Голоса за лучший ответ |
| `matches` | Взаимные совпадения |
| `reports` | Жалобы на контент |

### API

- `GET /health` — healthcheck
- `GET /api/user/me` — профиль
- `POST /api/user/gender` — установка пола
- `GET /api/session/:id` — состояние сессии
- `GET /api/session/:id/matches` — результаты матчей
- `POST /api/report` — жалоба

### WebSocket-события

| Событие | Направление | Описание |
|---------|------------|----------|
| `lobby:join` | C→S | Войти в лобби с вопросом |
| `roster:ready` | C→S | Подтверждение состава |
| `answer:submit` | C→S | Отправить ответ |
| `vote:submit` | C→S | Проголосовать |
| `matches:get` | C→S | Запросить матчи |
| `report:submit` | C→S | Жалоба |
| `session:update` | S→C | Обновление состояния |
| `session:closed` | S→C | Сессия закрыта |
| `timer:tick` | S→C | Обратный отсчёт |

## Безопасность

- Валидация Telegram `initData` (HMAC-SHA256)
- Rate limiting (60 req/min общий, 10/min на отправки)
- Базовая модерация токсичного контента
- Контакт выдаётся только после взаимного матча

## Конфигурация

| Переменная | По умолчанию | Описание |
|-----------|-------------|----------|
| `LOBBY_TIMEOUT_SEC` | 90 | Таймаут ожидания в лобби |
| `MIN_PLAYERS_PER_GENDER` | 2 | Минимум для старта |
| `MAX_PLAYERS_PER_GENDER` | 3 | Максимум в сессии |
| `ANSWER_TIMEOUT_SEC` | 60 | Время на ответ |
| `VOTE_TIMEOUT_SEC` | 30 | Время на голосование |
