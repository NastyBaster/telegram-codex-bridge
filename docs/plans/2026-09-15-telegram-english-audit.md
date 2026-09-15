# Telegram English Localization Audit

**Date:** 2026-09-15  
**Branch:** `integration/pr20-27`

## Scope

The audit scans `src/**/*.ts` for Han-script characters and then separates bridge-owned copy from tests, dynamic values, protocol data, and Feishu-owned copy.

## Baseline

- 50 source files contain Han characters.
- 29 are production files.
- 21 are test files.
- The current English PR set covers session creation, skills, project picker, plugin/app summaries, runtime notices, deferred terminal notices, and Windows Task Scheduler generation.
- The current English PR set does not yet provide a complete English path for interaction normalization, interaction summaries, rich input, browse errors, MCP/account/review/fork/thread commands, or all service fallbacks.

## Production ownership map

### Telegram rendering

Primary files:

- `src/telegram/ui-browser.ts`
- `src/telegram/ui-commands.ts`
- `src/telegram/ui-final-answer.ts`
- `src/telegram/ui-messages.ts`
- `src/telegram/ui-runtime.ts`
- `src/telegram/ui-shared.ts`
- `src/telegram/ui-bridge-actions.ts`
- `src/telegram/commands.ts`

Remaining gaps include browser labels and errors, command-panel copy, runtime fallback/reminder text, interaction button labels, duration/state labels, and several shared session/model fallbacks.

### Service and command orchestration

Primary files:

- `src/service.ts`
- `src/service/codex-command-coordinator.ts`
- `src/service/project-browser-coordinator.ts`
- `src/service/interaction-broker.ts`
- `src/service/rich-input-adapter.ts`
- `src/service/turn-coordinator.ts`
- `src/service/runtime-surface-controller.ts`

Remaining gaps include expired callback responses, unavailable/busy/error fallbacks, `/mcp`, `/account`, `/review`, `/fork`, `/thread`, rich input, voice, attachment, and browse flows.

### Core and protocol-to-UI boundaries

Primary files:

- `src/interactions/normalize.ts`
- `src/core/workflow/interaction-support.ts`
- `src/core/workflow/interaction-workflow.ts`
- `src/core/workflow/terminal-workflow.ts`
- `src/activity/tracker.ts`
- `src/codex/server-request-policy.ts`

These files contain user-visible titles, subtitles, questions, approval labels, resolved summaries, delivery fallbacks, activity notices, and policy error messages. They need either an explicit `UiLanguage` input or a semantic-only return type with Telegram-owned rendering.

### Intentional non-Telegram copy

`src/feishu/**` contains Feishu-owned Chinese copy and should not be translated as part of the Telegram English pass. Dynamic project names, filenames, descriptions, URLs, model names, skill names, plugin names, and user-provided text must also remain unchanged.

## Priority order

1. Add language-aware copy to `src/interactions/normalize.ts` and the approval/questionnaire render path.
2. Add English paths to `src/service/rich-input-adapter.ts` and `src/service/project-browser-coordinator.ts`.
3. Localize `/mcp`, `/account`, `/review`, `/fork`, `/thread`, model, and rollback command surfaces.
4. Localize remaining Telegram runtime/browser/shared fallbacks in `src/telegram/**` and `src/service.ts`.
5. Move repeated copy into a small locale module after the ownership boundaries are stable.

## Guardrail

Add an English-surface test that inspects both message text and inline keyboard labels. It must reject Han characters only in bridge-owned template fields, while allowing dynamic operator- or upstream-provided values.

## Completion definition

The Telegram English mode is complete when the representative smoke flows for `/new`, commands, runtime, interactions, browse, rich input, attachments, and voice contain no bridge-owned Han text, while Chinese mode and Feishu behavior remain unchanged.
