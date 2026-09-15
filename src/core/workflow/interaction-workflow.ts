import type {
  NormalizedInteraction,
} from "../../interactions/normalize.js";
import type { PersistedInteractionRecord } from "../domain/records.js";
import type { BridgeCommandActionView } from "../interaction-model/bridge-actions.js";
import type { InteractionCardView } from "../interaction-model/interaction.js";
import {
  buildAnsweredInteractionDetails,
  buildApprovalActions,
  findQuestionIndex,
  formatPendingInteractionTerminalReason,
  getCurrentQuestion,
  parseQuestionnaireDraft,
  summarizeAnsweredInteractionForSurface,
  summarizePermissions
} from "./interaction-support.js";
import { localizeNormalizedInteraction } from "../../interactions/normalize.js";
import type { UiLanguage } from "../../types.js";

export function createInteractionCardView(
  row: PersistedInteractionRecord,
  interaction: NormalizedInteraction,
  options?: {
    answeredExpanded?: boolean;
    language?: UiLanguage;
    hubHint?: string | null;
    bridgeActions?: BridgeCommandActionView[];
  }
): InteractionCardView {
  const hubHint = options?.hubHint ?? null;
  const bridgeActions = options?.bridgeActions ?? [];
  const language = options?.language ?? "zh";
  interaction = localizeNormalizedInteraction(interaction, language);

  if (row.state === "answered") {
    const details = buildAnsweredInteractionDetails(row.responseJson, interaction, language);
    return {
      kind: "resolved",
      title: interaction.title,
      state: "answered",
      summary: summarizeAnsweredInteractionForSurface(row.responseJson, interaction, language),
      details,
      expandable: details.length > 0,
      expanded: options?.answeredExpanded ?? false,
      interactionId: row.interactionId,
      ...(language === "en" ? { language } : {}),
      hubHint,
      ...(bridgeActions.length > 0 ? { bridgeActions } : {})
    };
  }

  if (row.state === "canceled") {
    return {
      kind: "resolved",
      ...(language === "en" ? { language } : {}),
      title: interaction.title,
      state: "canceled",
      summary: language === "en" ? "Canceled" : "已取消",
      details: [],
      expandable: false,
      expanded: false,
      ...(hubHint ? { hubHint } : {}),
      ...(bridgeActions.length > 0 ? { bridgeActions } : {})
    };
  }

  if (row.state === "failed") {
    return {
      kind: "resolved",
      ...(language === "en" ? { language } : {}),
      title: interaction.title,
      state: "failed",
      summary: formatPendingInteractionTerminalReason(row.errorReason, language),
      details: [],
      expandable: false,
      expanded: false,
      hubHint: null
    };
  }

  if (row.state === "expired") {
    return {
      kind: "expired",
      ...(language === "en" ? { language } : {}),
      title: interaction.title,
      reason: formatPendingInteractionTerminalReason(row.errorReason, language)
    };
  }

  switch (interaction.kind) {
    case "approval":
      return {
        kind: "approval",
        ...(language === "en" ? { language } : {}),
        interactionId: row.interactionId,
        title: interaction.title,
        subtitle: interaction.subtitle,
        body: interaction.body,
        detail: interaction.detail,
        hubHint,
        ...(bridgeActions.length > 0 ? { bridgeActions } : {}),
        actions: buildApprovalActions(interaction)
      };
    case "permissions":
      return {
        kind: "approval",
        ...(language === "en" ? { language } : {}),
        interactionId: row.interactionId,
        title: interaction.title,
        subtitle: interaction.subtitle,
        body: summarizePermissions(interaction.requestedPermissions, language),
        detail: interaction.detail,
        hubHint,
        ...(bridgeActions.length > 0 ? { bridgeActions } : {}),
        actions: [
          { text: "批准本次权限", decisionKey: "accept" },
          { text: "本会话内总是批准", decisionKey: "acceptForSession" },
          { text: "拒绝", decisionKey: "decline" }
        ]
      };
    case "elicitation":
      return {
        kind: "approval",
        ...(language === "en" ? { language } : {}),
        interactionId: row.interactionId,
        title: interaction.title,
        subtitle: `MCP: ${interaction.serverName}`,
        body: interaction.message,
        detail: interaction.detail,
        hubHint,
        ...(bridgeActions.length > 0 ? { bridgeActions } : {}),
        actions: [
          { text: "接受", decisionKey: "accept" },
          { text: "拒绝", decisionKey: "decline" }
        ]
      };
    case "questionnaire": {
      const draft = parseQuestionnaireDraft(row.responseJson);
      const currentQuestion = getCurrentQuestion(interaction, draft);
      if (!currentQuestion) {
        return {
        kind: "resolved",
          ...(language === "en" ? { language } : {}),
          title: interaction.title,
          state: "answered",
          summary: summarizeAnsweredInteractionForSurface(row.responseJson, interaction, language),
          details: [],
          expandable: false,
          expanded: false,
          ...(hubHint ? { hubHint } : {})
        };
      }

      return {
        kind: "question",
        ...(language === "en" ? { language } : {}),
        interactionId: row.interactionId,
        title: interaction.title,
        questionId: currentQuestion.id,
        header: currentQuestion.header,
        question: currentQuestion.question,
        questionIndex: findQuestionIndex(interaction, currentQuestion.id) + 1,
        totalQuestions: interaction.questions.length,
        options: currentQuestion.options?.map((option) => ({
          label: option.label,
          description: option.description
        })) ?? null,
        isOther: currentQuestion.isOther,
          isSecret: currentQuestion.isSecret,
          awaitingText: row.state === "awaiting_text",
          hubHint,
          ...(bridgeActions.length > 0 ? { bridgeActions } : {})
        };
    }
  }
}
