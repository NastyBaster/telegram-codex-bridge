import type { PersistedTerminalResultRecord } from "../domain/records.js";
import type {
  RecentOutputEntryView,
  TerminalResultControlView,
  TerminalResultDeliveryView
} from "../interaction-model/terminal.js";
import type { UiLanguage } from "../../types.js";

const DEFERRED_TERMINAL_NOTICE_COPY: Record<UiLanguage, {
  planResult: string;
  finalAnswer: string;
}> = {
  zh: {
    planResult: "<i>方案结果暂未送达。点击“展开方案”重新渲染。</i>",
    finalAnswer: "<i>最终答复暂未送达。点击“展开全文”重新渲染。</i>"
  },
  en: {
    planResult: "<i>The plan result has not been delivered yet. Tap \"Expand plan\" to render it again.</i>",
    finalAnswer: "<i>The final answer has not been delivered yet. Tap \"Expand full answer\" to render it again.</i>"
  }
};

export function createTerminalResultDeliveryView(
  saved: PersistedTerminalResultRecord,
  truncated: boolean
): TerminalResultDeliveryView {
  const collapsible = truncated || saved.pages.length > 1;
  return {
    kind: saved.kind,
    html: collapsible
      ? saved.previewHtml
      : (saved.pages[0] ?? saved.previewHtml),
    controls: createTerminalResultControls(saved, { collapsible })
  };
}

export function createDeferredTerminalNoticeView(
  saved: PersistedTerminalResultRecord,
  language: UiLanguage = "zh"
): TerminalResultDeliveryView {
  const copy = DEFERRED_TERMINAL_NOTICE_COPY[language];
  if (saved.kind === "plan_result") {
    return {
      kind: "plan_result",
      html: copy.planResult,
      controls: createTerminalResultControls(saved)
    };
  }

  return {
    kind: "final_answer",
    html: copy.finalAnswer,
    controls: createTerminalResultControls(saved)
  };
}

export function createRecentOutputEntryView(options: RecentOutputEntryView): RecentOutputEntryView {
  return {
    ...(options.sessionName !== undefined ? { sessionName: options.sessionName } : {}),
    ...(options.projectName !== undefined ? { projectName: options.projectName } : {}),
    hasResult: options.hasResult
  };
}

export function createRecentOutputControlsView(
  saved: PersistedTerminalResultRecord,
  options?: {
    expanded?: boolean;
    currentPage?: number;
  }
): TerminalResultControlView {
  return createTerminalResultControls(saved, options);
}

function createTerminalResultControls(
  saved: PersistedTerminalResultRecord,
  options?: {
    collapsible?: boolean;
    expanded?: boolean;
    currentPage?: number;
  }
): TerminalResultControlView {
  return {
    answerId: saved.answerId,
    totalPages: saved.pages.length,
    collapsible: options?.collapsible ?? true,
    expanded: options?.expanded ?? false,
    ...(options?.currentPage !== undefined ? { currentPage: options.currentPage } : {}),
    primaryActionConsumed: saved.primaryActionConsumed
  };
}
