import type {
  NormalizedApprovalInteraction,
  NormalizedInteraction,
  NormalizedQuestion,
  NormalizedQuestionnaireInteraction
} from "../../interactions/normalize.js";
import { asRecord, getString, getStringArray } from "../../util/untyped.js";
import type { UiLanguage } from "../../types.js";

export interface QuestionnaireDraft {
  answers: Record<string, unknown>;
  awaitingQuestionId?: string | null;
}

export function buildApprovalActions(interaction: NormalizedApprovalInteraction): Array<{ text: string; decisionKey: string }> {
  return interaction.decisionOptions
    .filter((option) => option.kind !== "cancel")
    .map((option) => ({
      decisionKey: option.key,
      text: option.label
    }));
}

export function buildAnsweredInteractionDetails(
  responseJson: string | null,
  interaction: NormalizedInteraction,
  language: UiLanguage = "zh"
): string[] {
  if (interaction.kind !== "questionnaire") {
    return [];
  }

  const details: string[] = [];
  const payload = parseJsonRecord(responseJson);
  const answers = parseJsonRecord(payload?.answers);
  if (!answers) {
    return [];
  }

  for (const [index, question] of interaction.questions.entries()) {
    const answerRecord = parseJsonRecord(answers[question.id]);
    const answerList = extractAnsweredInteractionValues(answerRecord);
    if (!answerList) {
      continue;
    }

    details.push(`${index + 1}. ${question.header}`);
    details.push(`${language === "en" ? "Question: " : "问题："}${question.question}`);
    details.push(`${language === "en" ? "Answer: " : "回答："}${question.isSecret
      ? (language === "en" ? "Sensitive answer submitted; content hidden" : "已提交敏感回答，不显示内容")
      : answerList.join(language === "en" ? ", " : "，")}`);
  }

  return details;
}

export function summarizeAnsweredInteractionForSurface(
  responseJson: string | null,
  interaction: NormalizedInteraction,
  language: UiLanguage = "zh"
): string | null {
  if (interaction.kind !== "questionnaire") {
    return summarizeAnsweredInteraction(responseJson, interaction, language);
  }

  const payload = parseJsonRecord(responseJson);
  const answers = parseJsonRecord(payload?.answers);
  if (!answers) {
    return summarizeAnsweredInteraction(responseJson, interaction, language);
  }

  const segments = interaction.questions
    .map((question) => {
      const answerRecord = parseJsonRecord(answers[question.id]);
      const answerList = extractAnsweredInteractionValues(answerRecord);
      if (!answerList) {
        return null;
      }

      const answerText = question.isSecret
        ? (language === "en" ? "Sensitive answer submitted; content hidden" : "已提交敏感回答，不显示内容")
        : answerList.join(language === "en" ? ", " : "，");
      return `${question.header}: ${answerText}`;
    })
    .filter((value): value is string => Boolean(value));

  if (segments.length === 0) {
    return summarizeAnsweredInteraction(responseJson, interaction, language);
  }

  return `${interaction.title} / ${segments.join(" / ")}`;
}

export function summarizePermissions(value: unknown, language: UiLanguage = "zh"): string | null {
  const parts = collectPermissionSummaryParts(value, language);
  return parts.length > 0 ? parts.join(language === "en" ? "; " : "；") : language === "en" ? "No additional permissions" : "无额外权限";
}

export function formatPendingInteractionTerminalReason(reason: string | null | undefined, language: UiLanguage = "zh"): string | null {
  if (language === "en") {
    switch (reason) {
      case "app_server_lost": return "The Codex service disconnected, so this interaction cannot continue.";
      case "bridge_restart": return "The bridge service restarted, so this interaction cannot continue.";
      case "response_dispatch_failed": return "The Codex service did not receive this interaction response.";
      case "turn_completed":
      case "turn_failed":
      case "turn_interrupted": return "The current operation ended and this interaction expired.";
      case "interaction_delivery_failed":
      case "telegram_delivery_failed": return "The control surface could not deliver this interaction.";
      default: return reason ? "This interaction cannot continue." : null;
    }
  }

  switch (reason) {
    case "app_server_lost":
      return "Codex 服务已断开，这个交互无法继续。";
    case "bridge_restart":
      return "桥接服务已重启，这个交互无法继续。";
    case "response_dispatch_failed":
      return "Codex 服务没有收到这次交互结果。";
    case "turn_completed":
    case "turn_failed":
    case "turn_interrupted":
      return "当前操作已结束，交互已失效。";
    case "interaction_delivery_failed":
    case "telegram_delivery_failed":
      return "当前控制面未能送达这条交互。";
    default:
      return reason ? "这个交互无法继续。" : null;
  }
}

export function parseQuestionnaireDraft(responseJson: string | null): QuestionnaireDraft {
  if (!responseJson) {
    return { answers: {} };
  }

  try {
    const parsed = asRecord(JSON.parse(responseJson));
    return {
      answers: asRecord(parsed?.answers) ?? {},
      awaitingQuestionId: getString(parsed, "awaitingQuestionId")
    };
  } catch {
    return { answers: {} };
  }
}

export function getCurrentQuestion(
  interaction: NormalizedQuestionnaireInteraction,
  draft: QuestionnaireDraft
): NormalizedQuestion | null {
  if (draft.awaitingQuestionId) {
    return interaction.questions.find((question) => question.id === draft.awaitingQuestionId) ?? null;
  }

  return interaction.questions.find((question) => !hasDraftAnswer(draft, question.id)) ?? null;
}

export function findQuestionIndex(interaction: NormalizedQuestionnaireInteraction, questionId: string): number {
  return Math.max(0, interaction.questions.findIndex((question) => question.id === questionId));
}

export function hasDraftAnswer(draft: QuestionnaireDraft, questionId: string): boolean {
  return Object.prototype.hasOwnProperty.call(draft.answers, questionId);
}

function summarizeAnsweredInteraction(
  responseJson: string | null,
  interaction: NormalizedInteraction,
  language: UiLanguage = "zh"
): string | null {
  const payload = parseJsonRecord(responseJson);
  switch (interaction.kind) {
    case "approval": {
      const decisionRecord = asRecord(payload?.decision);
      if (decisionRecord?.acceptWithExecpolicyAmendment) {
        return language === "en" ? "Approved and command rules updated" : "已批准，并更新命令规则";
      }
      if (decisionRecord?.applyNetworkPolicyAmendment) {
        const networkDecision = asRecord(decisionRecord.applyNetworkPolicyAmendment);
        const amendment = asRecord(networkDecision?.network_policy_amendment);
        const host = typeof amendment?.host === "string" ? amendment.host : null;
        return host
          ? (language === "en" ? `Approved and saved network rule (${host})` : `已批准，并保存网络规则（${host}）`)
          : language === "en" ? "Approved and saved network rule" : "已批准，并保存网络规则";
      }

      const decision = typeof payload?.decision === "string" ? payload.decision : null;
      if (decision === "accept" || decision === "approved") {
        return language === "en" ? "Approved" : "已批准";
      }
      if (decision === "acceptForSession" || decision === "approved_for_session") {
        return language === "en" ? "Approved and saved for this session" : "已批准，并写入本会话缓存";
      }
      if (decision === "decline" || decision === "denied") {
        return language === "en" ? "Declined" : "已拒绝";
      }
      if (decision === "cancel" || decision === "abort") {
        return language === "en" ? "Canceled" : "已取消";
      }
      return language === "en" ? "Handled" : "已处理";
    }
    case "permissions": {
      const scope = typeof payload?.scope === "string" ? payload.scope : "turn";
      const granted = summarizeGrantedPermissions(payload?.permissions ?? null, language);
      return granted
        ? (language === "en" ? `Granted (${scope}): ${granted}` : `已授权（${scope}）: ${granted}`)
        : language === "en" ? `Declined (${scope})` : `已拒绝（${scope}）`;
    }
    case "elicitation": {
      const action = typeof payload?.action === "string" ? payload.action : null;
      return action === "accept"
        ? language === "en" ? "Accepted" : "已接受"
        : action === "decline" ? language === "en" ? "Declined" : "已拒绝"
          : action === "cancel" ? language === "en" ? "Canceled" : "已取消"
            : language === "en" ? "Handled" : "已处理";
    }
    case "questionnaire": {
      const action = typeof payload?.action === "string" ? payload.action : null;
      if (action === "cancel") {
        return language === "en" ? "Canceled" : "已取消";
      }
      if (action === "decline") {
        return language === "en" ? "Declined" : "已拒绝";
      }
      if (action === "accept") {
        const content = parseJsonRecord(payload?.content);
        const count = content ? Object.keys(content).length : 0;
        return count > 0
          ? (language === "en" ? `Submitted ${count} fields` : `已提交 ${count} 个字段`)
          : language === "en" ? "Form submitted" : "已提交表单";
      }

      const answers = parseJsonRecord(payload?.answers);
      const count = answers ? Object.keys(answers).length : 0;
      return count > 0
        ? (language === "en" ? `Submitted ${count} answers` : `已提交 ${count} 个回答`)
        : language === "en" ? "Answers submitted" : "已提交回答";
    }
  }
}

function summarizeGrantedPermissions(value: unknown, language: UiLanguage = "zh"): string | null {
  const parts = collectPermissionSummaryParts(value, language);
  return parts.length > 0 ? parts.join(language === "en" ? "; " : "；") : null;
}

function collectPermissionSummaryParts(value: unknown, language: UiLanguage = "zh"): string[] {
  const record = parseJsonRecord(value);
  if (!record) {
    return [];
  }

  const parts: string[] = [];
  const fileSystem = parseJsonRecord(record.fileSystem);
  if (fileSystem) {
    const read = Array.isArray(fileSystem.read) ? fileSystem.read.length : 0;
    const write = Array.isArray(fileSystem.write) ? fileSystem.write.length : 0;
    if (read > 0 || write > 0) {
      parts.push(language === "en" ? `Filesystem read ${read}/write ${write}` : `文件系统 读${read}/写${write}`);
    }
  }

  const network = parseJsonRecord(record.network);
  if (network?.enabled === true) {
    parts.push(language === "en" ? "Network" : "网络");
  }

  const macos = parseJsonRecord(record.macos);
  if (macos) {
    parts.push(language === "en" ? "macOS permissions" : "macOS 权限");
  }

  return parts;
}

function extractAnsweredInteractionValues(record: Record<string, unknown> | null): string[] | null {
  if (!record) {
    return null;
  }

  const answers = getStringArray(record, "answers");
  return answers.length > 0 ? answers : null;
}

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      return parseJsonRecord(JSON.parse(value));
    } catch {
      return null;
    }
  }

  return asRecord(value);
}
