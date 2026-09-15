import type { InteractionRef } from "../domain/context.js";
import type { BridgeCommandActionView } from "./bridge-actions.js";
import type { UiLanguage } from "../../types.js";

export interface InteractionActionView {
  text: string;
  decisionKey: string;
}

export interface InteractionApprovalCardView extends InteractionRef {
  kind: "approval";
  language?: UiLanguage;
  title: string;
  subtitle: string;
  body?: string | null;
  detail?: string | null;
  hubHint?: string | null;
  bridgeActions?: BridgeCommandActionView[];
  actions: InteractionActionView[];
}

export interface InteractionQuestionOptionView {
  label: string;
  description: string;
}

export interface InteractionQuestionCardView extends InteractionRef {
  kind: "question";
  language?: UiLanguage;
  title: string;
  questionId: string;
  header: string;
  question: string;
  questionIndex: number;
  totalQuestions: number;
  options: InteractionQuestionOptionView[] | null;
  isOther: boolean;
  isSecret: boolean;
  awaitingText?: boolean;
  hubHint?: string | null;
  bridgeActions?: BridgeCommandActionView[];
}

export interface InteractionResolvedCardView {
  kind: "resolved";
  language?: UiLanguage;
  title: string;
  state: "answered" | "canceled" | "failed";
  summary?: string | null;
  details?: string[];
  expandable?: boolean;
  expanded?: boolean;
  interactionId?: string;
  hubHint?: string | null;
  bridgeActions?: BridgeCommandActionView[];
}

export interface InteractionExpiredCardView {
  kind: "expired";
  language?: UiLanguage;
  title: string;
  reason?: string | null;
}

export type InteractionCardView =
  | InteractionApprovalCardView
  | InteractionQuestionCardView
  | InteractionResolvedCardView
  | InteractionExpiredCardView;
