# Telegram i18n Completion Plan

**Date:** 2026-09-13

**Status:** Proposed implementation plan

## Problem

The bridge already has an explicit UI language setting and several Telegram surfaces can render English. However, many user-facing strings are still hardcoded in Chinese across Telegram command replies, runtime surfaces, interaction cards, service notices, and shared workflow helpers.

This creates a mixed-language Telegram UX when the stored UI language is English. The mixed state is hard for non-Chinese operators to use and conflicts with the earlier runtime design direction that the bridge should read as either fully Chinese or fully English, not both at once.

## Current Evidence

A source scan for Han characters currently finds:

- 49 `src` files with Chinese text
- 28 production files
- 21 test files

The production files are concentrated in these areas:

- Telegram rendering helpers: command panel, browser, runtime cards, session/project replies, final-answer fallback text, bridge action labels
- Service coordinators: session/project flow, Codex command flow, runtime surfaces, interactions, rich input, turn coordination
- Core workflow reducers: interaction summaries, terminal fallback delivery, approval/questionnaire status text
- Activity/status summaries
- Feishu pack UI and card rendering

Not every Chinese string should be changed in one PR. Some strings are paired with existing `language === "en"` branches, some are test fixtures, and Feishu copy should remain pack-owned rather than being accidentally rewritten as Telegram copy.

## Goal

Make the active Telegram UI language authoritative for all Telegram user-facing copy.

For `language === "en"`:

- Telegram command replies use English headings, labels, button text, notices, errors, and hints.
- Runtime cards, hubs, inspect views, interaction cards, and final-answer fallbacks do not leak Chinese labels.
- Shared Core/workflow text used by Telegram either receives language input or returns semantic states that Telegram renders locally.
- Tests assert English output on English surfaces instead of accepting mixed-language strings.

For `language === "zh"`:

- Existing Chinese UX remains supported unless a surface is intentionally English-only because the upstream source data is English.

## Non-Goals

- Do not add automatic language detection from Telegram client locale.
- Do not add Ukrainian in the same pass. Ukrainian can be added later after the English/Chinese locale boundary is explicit.
- Do not rewrite Feishu copy as part of Telegram cleanup unless the same shared helper is used by both packs and the boundary is clear.
- Do not mass-replace strings without checking whether they are product copy, protocol fixture text, test data, or pack-specific UI.

## Proposed Architecture

### 1. Centralize Copy Shape

Introduce a small locale module for bridge-owned user-facing copy:

```ts
type UiLanguage = "zh" | "en";

function t(language: UiLanguage, key: CopyKey, params?: Record<string, string | number>): string;
```

The first version can be intentionally modest:

- keep copy keys close to current domains
- avoid introducing a large framework
- support interpolation only where current strings already interpolate values
- keep Telegram HTML formatting outside the copy module when possible

Suggested key groups:

- `telegram.project.*`
- `telegram.session.*`
- `telegram.commands.*`
- `telegram.runtime.*`
- `telegram.browser.*`
- `telegram.interaction.*`
- `telegram.richInput.*`
- `core.workflow.*`

### 2. Pass Language To Owners

Prefer this ownership rule:

- Telegram-specific files render Telegram text from `UiLanguage`.
- Shared Core files should return semantic state or accept `UiLanguage` explicitly only when they already render user-facing text.
- Feishu pack copy remains Feishu-owned.

Avoid hidden defaults to Chinese in helper functions that are reachable from English Telegram surfaces.

### 3. Add A No-Chinese English-Surface Test

Add targeted tests for English Telegram surfaces:

- `/new` project picker
- `/skills`
- `/plugins`
- `/apps`
- `/status`
- `/where`
- `/inspect`
- runtime card and runtime hub
- approval/questionnaire interaction card
- file browser
- rich input errors
- `/compact`, `/clear`, `/rollback`

Each English fixture should assert that bridge-owned visible copy does not contain Han characters. The visible payload includes both message text and inline keyboard labels:

```ts
const visiblePayload = [
  message.text,
  ...message.replyMarkup.inline_keyboard.flatMap((row) => row.map((button) => button.text))
].join("\n");

assert.doesNotMatch(stripOperatorProvidedValues(visiblePayload), /\p{Script=Han}/u);
```

Use this as a guardrail for English mode, not as a repo-wide ban. The scan must be scoped to bridge-owned template copy:

- scan localized headings, labels, button text, hints, notices, and errors
- preserve operator- or upstream-provided values such as project names, filenames, file previews, user text, model names, skill descriptions, plugin descriptions, and app names
- either remove known dynamic values before the Han assertion or assert localized template fields separately

Chinese mode and Feishu Chinese fixtures should still be allowed.

## Suggested PR Sequence

### PR 1: Small English Fallbacks For High-Frequency Telegram Replies

Scope:

- session created / switched / selected confirmations
- `/skills` list headers and status markers
- no active session, stale button, busy-session messages

Why:

- these are commonly seen by new operators
- small PRs are easy to review
- they reduce immediate mixed-language friction

### PR 2: Project And Session Flow

Scope:

- project picker
- manual path prompt and confirmation
- browse-root picker
- archive/unarchive/rename/pin/plan replies

Tests:

- English project picker has no Han characters
- Chinese picker still renders existing Chinese copy

### PR 3: Runtime And Inspect Surfaces

Scope:

- runtime cards
- runtime hub
- `/status`
- `/where`
- `/inspect`
- runtime preference picker
- callback expiry and rate-limit notices

Tests:

- English runtime cards and inspect views have no Han characters
- Chinese runtime card snapshots remain covered

### PR 3b: Codex Command Lists And Admin Surfaces

Scope:

- `/plugins`
- `/apps`
- `/model`
- `/mcp`
- `/account`
- `/review`
- `/fork`
- `/thread`
- command callback expiry and unsupported-action notices for these surfaces

Tests:

- English command replies and inline keyboard labels have no Han characters in bridge-owned copy
- Chinese command replies preserve the existing Chinese copy
- user- or upstream-provided names and descriptions are not translated or rejected by the no-Han check

### PR 4: Interaction And Approval Surfaces

Scope:

- approval cards
- questionnaire cards
- resolved/expired/canceled interaction summaries
- permission/MCP form summaries
- delivery failure fallbacks

Implementation note:

- keep protocol decision payloads separate from user-facing text
- avoid using Chinese summary strings as shared Core state

### PR 5: Rich Input, Attachments, And Voice

Scope:

- `/local_image`, `/mention`, `/attach`
- pending structured-input prompts
- unreadable image/file messages
- disabled voice input and transcription errors

### PR 6: Locale Module And Cleanup

Scope:

- introduce the locale helper after enough repeated copy has been identified
- move repeated strings into key-based copy
- add a scan/test command or documented check for English Telegram leakage

This can happen earlier if reviewers prefer the locale helper before more copy changes.

### PR 7: Ukrainian Locale Follow-Up

Scope:

- add `uk` only after the English/Chinese key boundary is stable
- keep English as fallback for missing Ukrainian keys

This should be a separate contribution so the first i18n work stays easy to review.

## Acceptance Criteria

English Telegram mode is complete when:

- `/language` set to English persists in the state store.
- A representative Telegram smoke test covering project selection, commands, runtime, interactions, browse, and rich input has no Han characters in user-facing messages.
- Chinese mode still has intentional Chinese copy for the same surfaces.
- Feishu pack behavior is unchanged except for shared Core text that has been intentionally localized.
- New user-facing Telegram strings have an English path and a Chinese path, or an explicit reason why the source text is operator-provided and not translated.

## Manual Smoke Checklist

Run with `/language` set to English:

1. `/new` and create a session.
2. `/skills`, `/plugins`, `/apps`.
3. `/status`, `/where`, `/inspect`.
4. Start a task that requires approval or a question.
5. `/browse` and preview a text file.
6. Try `/local_image` with an invalid path.
7. `/compact`, `/clear`, `/rollback` on a safe test session.

Expected result:

- bridge-owned labels, hints, buttons, and errors are English
- project names, skill descriptions, model names, file paths, and user-provided text remain unchanged
