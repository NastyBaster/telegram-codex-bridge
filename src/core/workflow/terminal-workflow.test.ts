import test from "node:test";
import assert from "node:assert/strict";

import type { PersistedTerminalResultRecord } from "../domain/records.js";
import {
  createDeferredTerminalNoticeView,
  createRecentOutputControlsView,
  createRecentOutputEntryView,
  createTerminalResultDeliveryView
} from "./terminal-workflow.js";

function createFinalAnswerViewRow(
  overrides: Partial<PersistedTerminalResultRecord> = {}
): PersistedTerminalResultRecord {
  return {
    answerId: overrides.answerId ?? "answer-1",
    kind: overrides.kind ?? "final_answer",
    deliveryState: overrides.deliveryState ?? "pending",
    previewHtml: overrides.previewHtml ?? "<b>Preview</b>",
    pages: overrides.pages ?? ["<b>Full answer</b>"],
    primaryActionConsumed: overrides.primaryActionConsumed ?? false
  };
}

test("createTerminalResultDeliveryView creates a semantic direct-delivery view", () => {
  const view = createTerminalResultDeliveryView(
    createFinalAnswerViewRow({
      kind: "plan_result",
      previewHtml: "<b>Plan preview</b>",
      pages: ["<b>Plan page 1</b>", "<b>Plan page 2</b>"]
    }),
    true
  );

  assert.deepEqual(view, {
    kind: "plan_result",
    html: "<b>Plan preview</b>",
    controls: {
      answerId: "answer-1",
      totalPages: 2,
      collapsible: true,
      expanded: false,
      primaryActionConsumed: false
    }
  });
});

test("createDeferredTerminalNoticeView creates semantic notice copy without Telegram state decisions", () => {
  const finalAnswerNotice = createDeferredTerminalNoticeView(
    createFinalAnswerViewRow({
      kind: "final_answer",
      pages: ["<b>Page 1</b>", "<b>Page 2</b>"]
    })
  );
  const planNotice = createDeferredTerminalNoticeView(
    createFinalAnswerViewRow({
      kind: "plan_result",
      pages: ["<b>Plan 1</b>"]
    })
  );

  assert.deepEqual(finalAnswerNotice, {
    kind: "final_answer",
    html: "<i>最终答复暂未送达。点击“展开全文”重新渲染。</i>",
    controls: {
      answerId: "answer-1",
      totalPages: 2,
      collapsible: true,
      expanded: false,
      primaryActionConsumed: false
    }
  });
  assert.deepEqual(planNotice, {
    kind: "plan_result",
    html: "<i>方案结果暂未送达。点击“展开方案”重新渲染。</i>",
    controls: {
      answerId: "answer-1",
      totalPages: 1,
      collapsible: true,
      expanded: false,
      primaryActionConsumed: false
    }
  });
});

test("createDeferredTerminalNoticeView uses English deferred notice copy when requested", () => {
  const finalAnswerNotice = createDeferredTerminalNoticeView(
    createFinalAnswerViewRow({
      kind: "final_answer",
      pages: ["<b>Page 1</b>", "<b>Page 2</b>"]
    }),
    "en"
  );
  const planNotice = createDeferredTerminalNoticeView(
    createFinalAnswerViewRow({
      kind: "plan_result",
      pages: ["<b>Plan 1</b>"]
    }),
    "en"
  );

  assert.equal(
    finalAnswerNotice.html,
    "<i>The final answer has not been delivered yet. Tap \"Expand full answer\" to render it again.</i>"
  );
  assert.equal(
    planNotice.html,
    "<i>The plan result has not been delivered yet. Tap \"Expand plan\" to render it again.</i>"
  );
});

test("createRecentOutputEntryView keeps recent-output identity in semantic form", () => {
  assert.deepEqual(createRecentOutputEntryView({
    sessionName: "Session Beta",
    projectName: "Project Two",
    hasResult: true
  }), {
    sessionName: "Session Beta",
    projectName: "Project Two",
    hasResult: true
  });
});

test("createRecentOutputControlsView reuses terminal controls for persisted recent output", () => {
  assert.deepEqual(
    createRecentOutputControlsView(
      createFinalAnswerViewRow({
        kind: "final_answer",
        pages: ["<b>One</b>", "<b>Two</b>"],
        primaryActionConsumed: true
      }),
      {
        expanded: true,
        currentPage: 2
      }
    ),
    {
      answerId: "answer-1",
      totalPages: 2,
      collapsible: true,
      expanded: true,
      currentPage: 2,
      primaryActionConsumed: true
    }
  );
});
