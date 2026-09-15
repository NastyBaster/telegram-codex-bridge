<!-- docmeta
role: leaf
layer: 3
parent: docs/product/README.md
children: []
summary: current Telegram UX contract for Codex-backed commands and structured rich-input submission
read_when:
  - the task is about model, skills, plugins, apps, MCP, account, review, fork, rollback, compact, thread metadata, or rich-input commands
skip_when:
  - the task is only about raw protocol capability with no Telegram command UX
source_of_truth:
  - docs/product/codex-command-reference.md
  - src/service/codex-command-coordinator.ts
  - src/service/rich-input-adapter.ts
  - src/codex/app-server.ts
  - src/telegram/commands.ts
-->

# Codex Command Reference

Current intended behavior for Telegram commands that adapt stable Codex control-plane capabilities into chat UX.

This file covers:
- model, skills, plugins, apps, MCP, and account commands
- review, fork, rollback, compact, and thread metadata commands
- structured rich inputs such as skill, local image, mention, and attach

When implementation detail matters, verify against:
- `src/service/codex-command-coordinator.ts`
- `src/service/rich-input-adapter.ts`
- `src/codex/app-server.ts`
- `src/telegram/commands.ts`

For the current bridge-owned app-server adoption boundary, request families, and notification/server-request handling, read `docs/architecture/codex-app-server-adoption.md`.

General command contract:
- Telegram is not a debug console
- every command returns a compact user-facing response
- structured Telegram command replies render field labels in bold via Telegram HTML
- plain one-line prompts and simple lists may stay plain text when they do not expose label-value fields

### `/plan`

Behavior:
- toggles the active session between default mode and plan mode
- persists the selected mode on the bridge session
- does not change the current running turn in place; the new mode applies on the next `turn/start`

Responses:
- switched on while idle: `已为会话「{session_name}」开启 Plan mode。下次任务开始时生效。`
- switched off while idle: `已为会话「{session_name}」关闭 Plan mode。下次任务开始时生效。`
- switched on while running: `已为会话「{session_name}」开启 Plan mode。当前任务不受影响，下次任务开始时生效。`
- switched off while running: `已为会话「{session_name}」关闭 Plan mode。当前任务不受影响，下次任务开始时生效。`
- no active session: `当前没有活动会话。`

### `/model` and `/model <model_id>`

Shows:
- a two-step inline-button picker driven by the current app-server `model/list`
- step 1 shows configured state and effective runtime state separately
- model rows mark `已配置` and `生效`; the Telegram UX does not treat `model/list.isDefault` as a user-facing current-state marker
- the clear-default row is an explicit "clear overrides" action rather than a duplicate default-model display row
- small model lists stay on one page; pagination is shown only when needed
- step 2 appears only when the chosen model exposes multiple `supportedReasoningEfforts`; otherwise the bridge skips directly to confirmation
- reasoning effort button copy translates protocol values into user-facing Chinese labels
- the active session's `configured` and `effective` model + reasoning values

Rules:
- selection is stored on the bridge session and applied on the next `thread/start` or `turn/start`
- the bridge stores model and reasoning effort separately; `默认` means "do not pin an override for this field"
- effective defaults are resolved from runtime/thread truth (`thread/start`, `thread/resume`, and `config/read`) instead of being inferred from `model/list.isDefault`
- the bridge does not expose provider setup or arbitrary config editing through Telegram
- confirmation uses `已为会话「{session_name}」设置模型：{model_and_effort}`

### `/skills`

Shows:
- the active session and project context, followed by the current project's available skills from `skills/list`
- each skill's enabled state and concise description when present

### `/skill <name> :: <prompt>`

Behavior:
- sends the selected skill as structured input
- if the prompt is omitted, queue the skill and use the next normal text message as the task prompt
- `/cancel` clears the queued structured input

### `/plugins`

Shows:
- the active session and project context, followed by the current project's discovered plugin marketplaces plus plugin summaries from `plugin/list`
- installed and enabled state per plugin when available
- install and uninstall command hints

Rules:
- use the active session project path as the discovery cwd
- keep the Telegram output to a compact list instead of dumping raw marketplace JSON

### `/plugin install <marketplace>/<plugin>` and `/plugin uninstall <plugin_id>`

Behavior:
- resolves `<marketplace>/<plugin>` against the live `plugin/list` result for the active project
- calls `plugin/install` with the resolved marketplace path plus plugin name
- calls `plugin/uninstall` with the provided plugin id

Responses:
- install success, `zh`: `已为项目「{project_name}」安装插件：{plugin_name}`
- install success, `en`: `Installed plugin for project "{project_name}": {plugin_name}`
- uninstall success, `zh`: `已为项目「{project_name}」卸载插件：{plugin_id}`
- uninstall success, `en`: `Uninstalled plugin for project "{project_name}": {plugin_id}`
- install or uninstall failure: compact Telegram error text rather than raw protocol frames
- when install returns `appsNeedingAuth`, include a short localized follow-up list of affected app names and install URLs when present

### `/apps`

Shows:
- the active session and project context, followed by the current app list from `app/list`
- app accessibility and enabled state
- concise plugin linkage and install URL data when present

Rules:
- use the active thread id when available so app gating matches the current session config
- keep the Telegram surface read-only; app install flows remain link-first rather than form-heavy Telegram setup

### `/mcp`, `/mcp reload`, and `/mcp login <name>`

Shows:
- current MCP server status from `mcpServerStatus/list`
- auth status plus compact counts for tools, resources, and templates

Behavior:
- `/mcp reload` calls `config/mcpServer/reload`
- `/mcp login <name>` calls `mcpServer/oauth/login` and returns the generated authorization URL

Rules:
- Telegram shows the login link and asks the user to re-run `/mcp` after auth instead of trying to mirror the whole OAuth browser flow inline
- keep MCP status in compact chat form rather than exposing raw server metadata dumps

### `/account`

Shows:
- current account summary from `account/read`
- whether OpenAI auth is still required
- best-effort rate-limit summary from `account/rateLimits/read` when available

### `/review [detached] [branch <name>|commit <sha>|custom <instructions>]`

Behavior:
- starts `review/start` against the active session thread
- if Codex returns a new review thread, the bridge creates a dedicated review session and makes it active
- review sessions inherit the active session's selected model
- detached review sessions are named `Review: <active session name>` as a manual label, so later automatic thread-title sync does not overwrite the review marker

### `/fork [name]`

Behavior:
- forks the active Codex thread into a new bridge session
- the new session becomes active immediately
- the selected model follows the forked session when present

### `/rollback` and `/rollback <n>`

Behavior:
- bare `/rollback` opens a target picker built from thread history and asks for confirmation before calling `thread/rollback`
- `/rollback <n>` remains as a direct compatibility path
- updates the active session's latest turn pointer to the returned thread state
- reminds the user that local file edits are not auto-reverted
- success copy names the affected session explicitly

### `/compact`

Behavior:
- requests `thread/compact/start`
- keeps the Telegram UX at the session level instead of exposing raw compact protocol detail
- success copy names the affected session explicitly

### `/clear`

Behavior:
- immediately starts a fresh replacement thread for the active bridge session
- keeps the active session, project binding, model selection, and Plan mode
- preserves the previous thread as an archived session snapshot so it can still be revisited later
- clears actionable pending interactions and queued transient rich-input state for the cleared session
- refuses while the current session is still running

### `/thread name <name>`

Behavior:
- calls `thread/name/set`
- mirrors the new thread name into the bridge session display name
- success copy confirms the new bridge-visible session title directly

### `/thread meta branch=<branch> sha=<sha> origin=<url>`

Behavior:
- calls `thread/metadata/update`
- supports `-` as a clear value for any provided field
- success copy names the affected session explicitly

### `/thread clean-terminals`

Behavior:
- calls `thread/backgroundTerminals/clean`
- keeps the response compact at the thread level instead of exposing terminal-session internals
- success copy names the affected session explicitly

### `/local_image <path> :: <prompt>`

Behavior:
- resolves the image path relative to the active project path
- sends a real `localImage` input to Codex
- if the prompt is omitted, queue the image and use the next normal text message as the task prompt

### `/mention <path-or-name|path> :: <prompt>`

Behavior:
- sends a real `mention` input to Codex
- `name | path` sets the visible mention label explicitly
- if the prompt is omitted, queue the mention and use the next normal text message as the task prompt

### `/attach <attachment_id> :: <prompt>`

Behavior:
- resolves a previously received file attachment from the current session
- extracts Codex-readable text from supported attachment types and submits it as structured input
- if the prompt is omitted, queue the attachment-derived input and use the next normal text message as the task prompt

Rules:
- attachments are session-scoped; an attachment id from another session is treated as missing
- when the bridge receives one or more file attachments, the next normal text message automatically carries the most recent attachments unless the user cancels or sends `/attach` explicitly
- unsupported or unreadable attachments return a compact Telegram error instead of sending a raw file blob into Codex
