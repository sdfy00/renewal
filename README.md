# Renewal Requests / Заявки на продление

> [English](#english) | [Русский](#русский)

---

## English

### Tool versions

| Tool | Version |
|------|---------|
| Node.js (inside Docker / local) | 22 LTS |
| Python (inside Docker / local) | 3.12 |
| PostgreSQL | 17 (Docker image `postgres:17-alpine`) |
| Docker Engine | 24+ |
| Docker Compose | v2.22+ |
| NestJS | 12 |
| React | 19 |
| Vite | 8 |
| TypeScript - backend | 6 |
| TypeScript - frontend | 7 |

---

### Running with Docker (recommended)

All services (database, backend, frontend, provider simulator) are defined in `docker-compose.yml` at the root.

#### Start everything

```bash
docker compose up --build
```

With hot-reload for source files (requires Docker Compose ≥ 2.22):

```bash
docker compose watch
```

#### Start individual services

```bash
# Database only
docker compose up postgres

# Provider simulator only
docker compose up provider

# Backend only (requires postgres to be healthy first)
docker compose up backend

# Frontend only
docker compose up frontend
```

#### Ports after startup

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:3000 |
| PostgreSQL | localhost:5432 |
| Provider simulator | http://localhost:8091 |

---

### Running locally (without Docker)

#### Database

Start PostgreSQL 17 separately (Docker or local install):

```bash
docker compose up postgres
```

All connection settings are read from `backend/.env` - see the backend step below.

#### Provider simulator

```bash
python3 provider_simulator.py
# Listens on http://127.0.0.1:8091
```

#### Backend (NestJS)

```bash
cd backend
cp .env.example .env   # copy the config template; open .env and fill in JWT_SECRET
npm install
npm run start:dev
# Listens on http://localhost:3000
```

The **background worker** is embedded in the NestJS application and starts automatically with it.
No separate process is needed.

#### Frontend (Vite + React)

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
# Listens on http://localhost:5173
```

---

### Migrations

```bash
cd backend

# Run all pending migrations
npm run migration:run

# Generate a new migration from entity changes
npm run migration:generate -- src/migrations/MigrationName

# Revert the last migration
npm run migration:revert
```

---

### Tests

```bash
cd backend

# Unit tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:cov

# E2E tests (requires a running PostgreSQL instance)
npm run test:e2e
```

---

### Test accounts

All accounts share the password **`password`**. They are seeded by the initial migration.

| Username | Space | Role(s) |
|----------|-------|---------|
| `initiator-alpha` | Alpha | Initiator - view Alpha, create requests |
| `approver-alpha` | Alpha | Approver - view Alpha, approve or reject |
| `initiator-beta` | Beta | Initiator - view Beta, create requests |
| `universal-alpha` | Alpha | Both initiator and approver in Alpha; cannot approve own request |

Login via `POST /auth/login`:
```json
{ "username": "initiator-alpha", "password": "password" }
```
Returns the authenticated user object `{ id, username, spaceRoles }` and sets an **HttpOnly `access_token` cookie**. All subsequent requests are authenticated via that cookie - no `Authorization` header required.

---

### API contracts

Interactive docs (Swagger UI) are available at **http://localhost:3000/api** once the backend is running.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/login` | - | Obtain JWT token |
| GET | `/spaces/:slug/resources` | Cookie | List resources with active request for a space |
| POST | `/spaces/:slug/resources/:resourceId/requests` | Cookie (initiator) | Create a renewal request |
| GET | `/spaces/:slug/requests` | Cookie | List all requests in a space |
| PATCH | `/requests/:id/approve` | Cookie (approver, not own) | Approve a pending request |
| PATCH | `/requests/:id/reject` | Cookie (approver, not own) | Reject a pending request |
| PATCH | `/requests/:id/retry` | Cookie (approver) | Retry a needs_attention request |
| GET | `/requests/:id/history` | Cookie (space member) | View state-transition history |

---

### State machine

```
                         approve
(create) ──► PENDING ────────────► IN_PROGRESS ──► COMPLETED
                 │                      │
                 │ reject                └── (3 failed POST) ──► NEEDS_ATTENTION
                 │                                                      │
                 ▼                                        (manual retry)──┘
              REJECTED
```

- **PENDING** - created by an initiator; awaiting approval or rejection.
- **IN_PROGRESS** - approved; the background worker is sending the renewal to the provider.
- **COMPLETED** - provider confirmed; the resource's expiry date has been updated once.
- **REJECTED** - closed without calling the provider; the resource is unchanged.
- **NEEDS_ATTENTION** - 3 POST attempts failed without a confirmed result; an approver must trigger a manual retry. The same idempotency key is reused on retry so the provider will not create a duplicate operation.

A resource may have at most one active request (PENDING, IN_PROGRESS, or NEEDS_ATTENTION).
The constraint is enforced at the database level with a partial unique index.

---

### Handling uncertain provider responses (503)

When the provider returns HTTP 503, the operation may or may not have been saved.
The backend uses the following recovery strategy:

1. **Idempotency key** - the request's UUID is sent as `Idempotency-Key` to the provider on every attempt.
2. **After 503** - wait `PROVIDER_RETRY_DELAY_MS` (default: `60000`) milliseconds, then retry `POST /renewals` with the **same key and body**. The provider is idempotent: it returns 200 with the saved operation on a repeated POST, so no duplicate operation is created.
3. **Limit** - after 3 failed POST attempts without a confirmed result, the request moves to `NEEDS_ATTENTION`.
4. **Retry** - the approver can manually trigger a retry; it reuses the same idempotency key so the provider will not create a duplicate operation.

Configure the delay:

```bash
export PROVIDER_RETRY_DELAY_MS=60000  # milliseconds (default)
```

**To test recovery with a restart:**

1. Set a short delay so there is enough time to stop the app: `export PROVIDER_RETRY_DELAY_MS=15000`
2. Start the app and approve a request via the UI or API.
3. The first `POST /renewals` returns 503 and the worker pauses for `PROVIDER_RETRY_DELAY_MS`.
4. Stop the app before the timer fires (within the 15-second window).
5. Start the app again. The worker resumes and retries `POST /renewals` with the same idempotency key. The provider returns 200 with the already-saved operation, and the worker marks the request COMPLETED.
6. The resource's expiry date is updated exactly once.

**Idempotency key format:** the UUID of the renewal request (returned as `id` in the API response). Use it to query the provider directly: `GET http://localhost:8091/renewals/{request_uuid}`.

---

### Recovery after restart

- Approval and job enqueueing are saved in a single database transaction.
- On startup, the background worker queries for all requests in `IN_PROGRESS` state and resumes processing them. Requests in `NEEDS_ATTENTION` require an explicit manual retry by an approver first (which resets the status back to `IN_PROGRESS`).
- The idempotency key is stable (derived from the request UUID), so a restarted app picks up the existing provider operation without creating a new one.

---

### Duplicate prevention

- **Parallel approval**: a `SELECT … FOR UPDATE` lock on the request row ensures only one concurrent approval succeeds; the second returns 409.
- **Duplicate job**: the partial unique index on active requests prevents a second job from being enqueued for the same resource.
- **Duplicate provider call**: the idempotency key sent to the provider guarantees `started_count = 1` even if `POST /renewals` is called multiple times.
- **Duplicate resource update**: the resource's expiry date is updated inside the same transaction that marks the request `COMPLETED`; idempotent check prevents a second update.

---

### Implementation status

- [x] Authentication (JWT, local login)
- [x] Database entities and migrations
- [x] Business logic modules (requests, resources, approvals)
- [x] Background worker (NestJS scheduled task)
- [x] Frontend UI (login, resource list, request form, approver actions)
- [x] Unit tests (RequestsService, RenewalWorkerService)
- [x] E2E tests (require a running PostgreSQL instance with seeds applied)

---

---

## Русский

### Версии инструментов

| Инструмент | Версия |
|------------|--------|
| Node.js (внутри Docker / локально) | 22 LTS |
| Python (внутри Docker / локально) | 3.12 |
| PostgreSQL | 17 (образ `postgres:17-alpine`) |
| Docker Engine | 24+ |
| Docker Compose | v2.22+ |
| NestJS | 12 |
| React | 19 |
| Vite | 8 |
| TypeScript - бэкенд | 6 |
| TypeScript - фронтенд | 7 |

---

### Запуск через Docker (рекомендуется)

Все сервисы (база данных, бэкенд, фронтенд, имитатор провайдера) описаны в `docker-compose.yml` в корне репозитория.

#### Запустить всё

```bash
docker compose up --build
```

С горячей перезагрузкой исходников (требуется Docker Compose ≥ 2.22):

```bash
docker compose watch
```

#### Запуск отдельных сервисов

```bash
# Только база данных
docker compose up postgres

# Только имитатор провайдера
docker compose up provider

# Только бэкенд (требует запущенного postgres)
docker compose up backend

# Только фронтенд
docker compose up frontend
```

#### Порты после запуска

| Сервис | Адрес |
|--------|-------|
| Фронтенд | http://localhost:5173 |
| Бэкенд API | http://localhost:3000 |
| PostgreSQL | localhost:5432 |
| Имитатор провайдера | http://localhost:8091 |

---

### Локальный запуск (без Docker)

#### База данных

Запустите PostgreSQL 17 отдельно (Docker или локальная установка):

```bash
docker compose up postgres
```

Все параметры подключения читаются из `backend/.env` - см. шаг бэкенда ниже.

#### Имитатор провайдера

```bash
python3 provider_simulator.py
# Слушает на http://127.0.0.1:8091
```

#### Бэкенд (NestJS)

```bash
cd backend
cp .env.example .env   # скопировать шаблон; открыть .env и заполнить JWT_SECRET
npm install
npm run start:dev
# Слушает на http://localhost:3000
```

**Фоновый обработчик** встроен в приложение NestJS и запускается автоматически вместе с ним.
Отдельный процесс не нужен.

#### Фронтенд (Vite + React)

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
# Слушает на http://localhost:5173
```

---

### Миграции

```bash
cd backend

# Применить все ожидающие миграции
npm run migration:run

# Сгенерировать новую миграцию по изменениям сущностей
npm run migration:generate -- src/migrations/НазваниеМиграции

# Откатить последнюю миграцию
npm run migration:revert
```

---

### Тесты

```bash
cd backend

# Юнит-тесты
npm test

# Режим наблюдения
npm run test:watch

# Покрытие
npm run test:cov

# E2E-тесты (требуется запущенный PostgreSQL)
npm run test:e2e
```

---

### Тестовые учетные записи

| Пользователь | Пространство | Роль |
|--------------|--------------|------|
| initiator-alpha | Alpha | Инициатор - просмотр Alpha, создание заявок |
| approver-alpha | Alpha | Согласующий - просмотр Alpha, одобрение или отклонение |
| initiator-beta | Beta | Инициатор - просмотр Beta, создание заявок |
| universal-alpha | Alpha | Обе роли в Alpha; не может согласовать свою заявку |

Вход через `POST /auth/login` с телом `{ "username": "...", "password": "..." }`.
Пароль для всех учётных записей: `password`. Данные созданы начальной миграцией (`backend/src/migrations/`).

---

### API-контракты

Интерактивная документация (Swagger UI) доступна по адресу **http://localhost:3000/api** после запуска бэкенда.

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/auth/login` | Получить JWT-токен |
| GET | `/spaces/:spaceId/resources` | Список ресурсов пространства |
| POST | `/spaces/:spaceId/resources/:resourceId/requests` | Создать заявку на продление |
| GET | `/spaces/:spaceId/requests` | Список заявок пространства |
| PATCH | `/requests/:id/approve` | Одобрить заявку |
| PATCH | `/requests/:id/reject` | Отклонить заявку |
| PATCH | `/requests/:id/retry` | Повторить обработку заявки в состоянии `needs_attention` |
| GET | `/requests/:id/history` | История переходов состояний |

---

### Модель состояний

```
                           одобрение
(создание) ──► PENDING ──────────────► IN_PROGRESS ──► COMPLETED
                   │                        │
                   │ отклонение              └── (3 неудачных POST) ──► NEEDS_ATTENTION
                   │                                                           │
                   ▼                                         (ручной повтор) ──┘
                REJECTED
```

- **PENDING** - создана инициатором, ожидает одобрения или отклонения.
- **IN_PROGRESS** - одобрена; фоновый обработчик отправляет продление провайдеру.
- **COMPLETED** - провайдер подтвердил; срок ресурса обновлён один раз.
- **REJECTED** - закрыта без обращения к провайдеру; ресурс не изменён.
- **NEEDS_ATTENTION** - 3 POST-попытки не дали подтверждённого результата; согласующий должен запустить повтор вручную. Используется тот же ключ идемпотентности - повторная операция у провайдера не создаётся.

У одного ресурса может быть не более одной активной заявки (PENDING, IN_PROGRESS или NEEDS_ATTENTION).
Ограничение закреплено на уровне базы данных через частичный уникальный индекс.

---

### Обработка неопределённого ответа провайдера (503)

Если провайдер вернул HTTP 503, неизвестно, была ли операция сохранена.
Бэкенд применяет следующую стратегию:

1. **Ключ идемпотентности** - UUID заявки передаётся как `Idempotency-Key` при каждой попытке.
2. **После 503** - ждёт `PROVIDER_RETRY_DELAY_MS` (по умолчанию: `60000` мс), затем повторяет `POST /renewals` с **тем же ключом и телом**. Провайдер идемпотентен: повторный POST возвращает 200 с уже сохранённой операцией без создания дубля.
3. **Лимит** - после 3 неудачных POST-попыток без подтверждённого результата заявка переходит в `NEEDS_ATTENTION`.
4. **Повтор** - согласующий может вручную запустить повторную обработку; используется тот же ключ, новая операция у провайдера не создаётся.

Настройка задержки:

```bash
export PROVIDER_RETRY_DELAY_MS=60000  # миллисекунды
```

**Проверка восстановления после перезапуска:** запустите приложение, согласуйте заявку, остановите приложение до следующего запроса к провайдеру (в течение окна задержки), затем запустите снова. Приложение возобновит задачу, повторит POST с тем же ключом идемпотентности, получит 200 с уже сохранённой операцией и завершит заявку без создания дубля.

---

### Восстановление после перезапуска

- Согласование и постановка задачи в очередь сохраняются в одной транзакции базы данных.
- При старте фоновый обработчик запрашивает все заявки в состоянии `IN_PROGRESS` и возобновляет их обработку. Заявки в `NEEDS_ATTENTION` требуют явного повторного запуска согласующим (что сбрасывает статус обратно в `IN_PROGRESS`).
- Ключ идемпотентности стабилен (формируется из UUID заявки), поэтому перезапущенное приложение подхватывает существующую операцию провайдера без создания новой.

---

### Защита от дублей

- **Параллельное согласование**: блокировка `SELECT … FOR UPDATE` на строке заявки гарантирует, что только один конкурентный запрос на одобрение завершится успехом; второй получит 409.
- **Дублирование задачи**: частичный уникальный индекс на активных заявках не позволяет поставить вторую задачу на один ресурс.
- **Дублирование вызова провайдера**: ключ идемпотентности гарантирует `started_count = 1`, даже если `POST /renewals` вызван несколько раз.
- **Дублирование обновления ресурса**: срок ресурса обновляется в той же транзакции, что переводит заявку в `COMPLETED`; идемпотентная проверка исключает повторное обновление.

---

### Статус реализации

- [x] Авторизация (JWT, локальный вход)
- [x] Сущности базы данных и миграции
- [x] Бизнес-логика (заявки, ресурсы, согласование)
- [x] Фоновый обработчик (планировщик задач NestJS)
- [x] Интерфейс (вход, список ресурсов, форма заявки, действия согласующего)
- [x] Юнит-тесты (RequestsService, RenewalWorkerService)
- [x] E2E-тесты (требуют запущенного экземпляра PostgreSQL с применёнными миграциями)
