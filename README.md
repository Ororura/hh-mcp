# HH MCP Server

Локальный stdio MCP server для надёжного выполнения действий соискателя на HH.ru через Playwright. Сервер проверяет сессию и состояние вакансии, готовит форму в безопасном dry-run режиме и выполняет реальный отклик только через отдельный destructive tool.

Сервер не ищет и не оценивает вакансии, не анализирует резюме, не выбирает `APPLY/SKIP`, не генерирует сопроводительные письма и не отвечает на вопросы работодателя.

## Требования и установка

- Node.js 24 LTS (`.nvmrc` включён в проект)
- npm

```bash
nvm use
npm install
npx playwright install chromium
```

Проверка проекта:

```bash
npm run typecheck
npm run build
npm test
```

## Первый вход в HH

```bash
npm run hh:login
```

Команда открывает headed Chromium с persistent profile. Войдите в HH вручную и закройте окно Chromium. Код не запрашивает и не сохраняет пароль; cookies и browser storage сохраняются самим Chromium в profile directory.

Не запускайте MCP server и `hh:login` одновременно: оба используют один профиль, а profile lock отклонит второй процесс.

## Запуск MCP

```bash
npm run mcp
```

stdout используется исключительно MCP transport. Диагностические сообщения с префиксом `[HH]` пишутся в stderr и не содержат cookies, токенов, storage state, полного HTML или текста сопроводительного письма.

## Environment

```env
HH_BROWSER_PROFILE_DIR=./data/hh-browser-profile
HH_HEADLESS=true
HH_TRACE=false
HH_ARTIFACTS_DIR=./artifacts
HH_HISTORY_PATH=./data/hh-history.sqlite
```

- `HH_HEADLESS` и `HH_TRACE` принимают только `true` или `false`.
- Production base URL фиксирован по умолчанию как `https://hh.ru`.
- Все относительные пути разрешаются от рабочего каталога процесса.

## Подключение к Codex

Актуальный формат проверен по локальному `codex-cli 0.150.1` и [официальной документации OpenAI по MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

Через CLI, заменив пути на абсолютные:

```bash
codex mcp add hh \
  --env HH_BROWSER_PROFILE_DIR=/absolute/path/to/hh-mcp/data/hh-browser-profile \
  --env HH_HEADLESS=true \
  --env HH_TRACE=false \
  -- npm --silent --prefix /absolute/path/to/hh-mcp run mcp
```

Проверка регистрации:

```bash
codex mcp list
```

Для явной настройки рабочего каталога и approval policy добавьте сервер в `~/.codex/config.toml` или project-scoped `.codex/config.toml` доверенного проекта:

```toml
[mcp_servers.hh]
command = "npm"
args = ["--silent", "run", "mcp"]
cwd = "/absolute/path/to/hh-mcp"
startup_timeout_sec = 20
tool_timeout_sec = 90
default_tools_approval_mode = "writes"

[mcp_servers.hh.env]
HH_BROWSER_PROFILE_DIR = "/absolute/path/to/hh-mcp/data/hh-browser-profile"
HH_HEADLESS = "true"
HH_TRACE = "false"
```

`writes` использует MCP annotations: read-only tools могут выполняться автоматически, а `hh_submit_application` помечен как destructive и требует подтверждения клиента.

Флаг npm `--silent` обязателен именно в Codex-конфигурации: lifecycle banner не должен попадать в stdout, зарезервированный для MCP JSON-RPC.

## MCP tools

### `hh_session_status`

Input:

```json
{}
```

Statuses: `AUTHENTICATED`, `AUTH_REQUIRED`, `CAPTCHA_REQUIRED`, `BUSY`, `FAILED`.

### `hh_inspect_vacancy`

Input:

```json
{
  "vacancyUrl": "https://hh.ru/vacancy/123456789"
}
```

Statuses: `AVAILABLE`, `ALREADY_APPLIED`, `VACANCY_CLOSED`, `AUTH_REQUIRED`, `CAPTCHA_REQUIRED`, `EXTERNAL_APPLICATION`, `UNSUPPORTED_FLOW`, `BUSY`, `FAILED`.

### `hh_prepare_application`

Безопасный dry-run. Открывает форму, определяет flow и заполняет переданное письмо, но не нажимает финальный submit. После загрузки вакансии блокирует state-changing HTTP requests.

Input:

```json
{
  "vacancyUrl": "https://hh.ru/vacancy/123456789",
  "coverLetter": "Здравствуйте! Рассмотрите, пожалуйста, мой отклик."
}
```

Пример output:

```json
{
  "status": "READY_TO_SUBMIT",
  "vacancy": {
    "id": "123456789",
    "title": "Java Backend Developer",
    "employer": "Example",
    "url": "https://hh.ru/vacancy/123456789"
  },
  "application": {
    "coverLetterFieldFound": true,
    "questionnaireRequired": false
  }
}
```

Дополнительные statuses: `MISSING_REQUIRED_COVER_LETTER`, `QUESTIONNAIRE_REQUIRED` и общие terminal states.

### `hh_submit_application`

> Destructive tool: выполняет реальный отклик от имени авторизованного пользователя.

Input:

```json
{
  "vacancyUrl": "https://hh.ru/vacancy/123456789",
  "coverLetter": "Здравствуйте! Рассмотрите, пожалуйста, мой отклик."
}
```

Успех возвращается только после появления подтверждения в HH UI:

```json
{
  "status": "SUBMITTED",
  "vacancy": {
    "id": "123456789",
    "title": "Java Backend Developer",
    "employer": "Example",
    "url": "https://hh.ru/vacancy/123456789"
  }
}
```

Один click не считается успехом. Если UI не подтвердил результат, server возвращает `FAILED` с `UNEXPECTED_PAGE_STATE`, сохраняет screenshot и не повторяет submit автоматически.

## Ошибки и результаты

Business states (`AUTH_REQUIRED`, `ALREADY_APPLIED`, `VACANCY_CLOSED`, `QUESTIONNAIRE_REQUIRED`, `CAPTCHA_REQUIRED`, `EXTERNAL_APPLICATION`, `BUSY`) возвращаются как обычный structured MCP result.

Техническая ошибка имеет вид:

```json
{
  "status": "FAILED",
  "message": "...",
  "error": {
    "code": "UNEXPECTED_PAGE_STATE",
    "message": "..."
  },
  "artifactPath": "/absolute/path/to/artifacts/...png"
}
```

Technical error codes: `NAVIGATION_FAILED`, `SELECTOR_NOT_FOUND`, `BROWSER_CRASHED`, `UNEXPECTED_PAGE_STATE`.

## Browser profile, history и artifacts

- Chromium profile: `data/hh-browser-profile/` либо `HH_BROWSER_PROFILE_DIR`.
- Локальная SQLite history: `data/hh-history.sqlite` либо `HH_HISTORY_PATH`.
- Screenshots: `artifacts/` либо `HH_ARTIFACTS_DIR`.
- Playwright traces при `HH_TRACE=true`: `artifacts/traces/`.

Screenshot автоматически создаётся для CAPTCHA, questionnaire, unsupported UI и technical failures. Локальная SQLite history используется для диагностики и duplicate protection, но перед submit всегда дополнительно проверяется HH UI.

## Безопасный smoke test

```bash
npm run hh:smoke -- --vacancy-url "https://hh.ru/vacancy/123456789"
```

Smoke-команда вызывает только inspect. В ней нет submit path.

## Архитектура

```text
Codex / orchestrator
        ↓ stdio MCP tools
HhMcpServer → HhAutomationService → explicit state machine
                                      ↓
                          HhVacancyPage / HhApplicationFlow
                                      ↓
                      BrowserManager → Playwright Chromium
```

- MCP transport отделён от application/browser logic.
- Все HH selectors собраны в `src/hh/HhSelectors.ts`.
- Один non-blocking mutex сериализует tool calls; файловая lease защищает persistent profile между процессами.
- `ArtifactManager` отвечает за безопасные имена screenshots/traces.
- `ApplicationHistoryRepository` хранит минимальную append-only историю вызовов.

## Ограничения v1

Не поддерживаются:

- поиск, scoring и выбор вакансий;
- генерация cover letter;
- автоматические ответы на questionnaire;
- CAPTCHA solving, anti-bot bypass, proxy, stealth/fingerprint spoofing;
- несколько HH-аккаунтов;
- scheduling и массовые parallel applications;
- автоматический повтор submit после неопределённого результата;
- неизвестные новые варианты HH UI — они возвращаются как `UNSUPPORTED_FLOW` с screenshot.

## Готовность для JobSearchAgent

Внешний Java Backend или AI orchestrator может независимо выполнить scoring и затем использовать последовательность:

```text
hh_inspect_vacancy
→ hh_prepare_application
→ explicit approval
→ hh_submit_application
→ сохранить SUBMITTED во внешнем backend
```

HH MCP не содержит зависимости от Java Backend и передаёт только компактные structured results.
