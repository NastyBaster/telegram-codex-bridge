import type { UiLanguage } from "../types.js";

export const LOCALE_COPY = {
  zh: {
    "interaction.approval.commandTitle": "Codex 需要命令批准",
    "interaction.approval.fileChangeTitle": "Codex 需要文件变更批准",
    "interaction.approval.patchTitle": "Codex 需要补丁批准",
    "interaction.approval.commandSubtitle": "命令审批",
    "interaction.approval.fileChangeSubtitle": "文件变更审批",
    "interaction.approval.patchSubtitle": "补丁审批",
    "interaction.decision.accept": "批准",
    "interaction.decision.acceptForSession": "本会话始终批准",
    "interaction.decision.acceptWithExecpolicyAmendment": "批准并更新命令规则",
    "interaction.decision.applyNetworkPolicyAmendment": "批准并保存网络规则{suffix}",
    "interaction.decision.decline": "拒绝",
    "interaction.decision.cancel": "取消本次交互",
    "interaction.permissions.title": "Codex 需要权限批准",
    "interaction.permissions.subtitle": "权限审批",
    "interaction.questionnaire.title": "Codex 需要更多信息",
    "interaction.questionnaire.skip": "跳过",
    "interaction.questionnaire.leaveEmpty": "留空",
    "interaction.questionnaire.yes": "是",
    "interaction.questionnaire.returnTrue": "返回 true",
    "interaction.questionnaire.no": "否",
    "interaction.questionnaire.returnFalse": "返回 false",
    "interaction.mcp.chooseOne": "从下方选一个选项。",
    "interaction.mcp.chooseYesNo": "请选择是或否。",
    "interaction.mcp.sendInteger": "请直接发送整数。",
    "interaction.mcp.sendNumber": "请直接发送数字。",
    "interaction.mcp.sendText": "请直接发送文字回答。",
    "interaction.mcp.required": "这是必填项。",
    "interaction.mcp.optional": "这是可选项。",
    "interaction.mcp.allowedValues": "可选值：{values}。多个值请用逗号分隔。",
    "interaction.mcp.separateValues": "多个值请用逗号分隔。",
    "interaction.mcp.provide": "请提供 {header}。",
    "interaction.mcp.confirmation": "MCP 发起了一个需要你确认的请求。",
    "interaction.validation.required": "这个问题不能跳过。",
    "interaction.validation.number": "请输入有效数字。",
    "interaction.validation.integer": "请输入整数。",
    "interaction.validation.boolean": "请输入 true/false 或 是/否。",
    "interaction.validation.arrayRequired": "请至少输入一个值。",
    "interaction.validation.arrayOptional": "请先输入至少一个值，或点击跳过。",
    "interaction.validation.empty": "回答不能为空。",
    "interaction.validation.invalidValue": "输入值不合法。",
    "interaction.validation.allowedValues": "可用值：{values}。",
    "interaction.detail.directory": "目录：{value}",
    "interaction.detail.grantRoot": "授权根目录：{value}"
  },
  en: {
    "interaction.approval.commandTitle": "Codex requests command approval",
    "interaction.approval.fileChangeTitle": "Codex requests approval for file changes",
    "interaction.approval.patchTitle": "Codex requests patch approval",
    "interaction.approval.commandSubtitle": "Command approval",
    "interaction.approval.fileChangeSubtitle": "File change approval",
    "interaction.approval.patchSubtitle": "Patch approval",
    "interaction.decision.accept": "Approve",
    "interaction.decision.acceptForSession": "Always approve for this session",
    "interaction.decision.acceptWithExecpolicyAmendment": "Approve and update command rules",
    "interaction.decision.applyNetworkPolicyAmendment": "Approve and save network rule{suffix}",
    "interaction.decision.decline": "Decline",
    "interaction.decision.cancel": "Cancel interaction",
    "interaction.permissions.title": "Codex requests permission approval",
    "interaction.permissions.subtitle": "Permission approval",
    "interaction.questionnaire.title": "Codex needs more information",
    "interaction.questionnaire.skip": "Skip",
    "interaction.questionnaire.leaveEmpty": "Leave empty",
    "interaction.questionnaire.yes": "Yes",
    "interaction.questionnaire.returnTrue": "Return true",
    "interaction.questionnaire.no": "No",
    "interaction.questionnaire.returnFalse": "Return false",
    "interaction.mcp.chooseOne": "Choose one of the options below.",
    "interaction.mcp.chooseYesNo": "Choose yes or no.",
    "interaction.mcp.sendInteger": "Send an integer.",
    "interaction.mcp.sendNumber": "Send a number.",
    "interaction.mcp.sendText": "Send a text answer.",
    "interaction.mcp.required": "This field is required.",
    "interaction.mcp.optional": "This field is optional.",
    "interaction.mcp.allowedValues": "Allowed values: {values}. Separate multiple values with commas.",
    "interaction.mcp.separateValues": "Separate multiple values with commas.",
    "interaction.mcp.provide": "Provide {header}.",
    "interaction.mcp.confirmation": "MCP sent a request that needs your confirmation.",
    "interaction.validation.required": "This question cannot be skipped.",
    "interaction.validation.number": "Enter a valid number.",
    "interaction.validation.integer": "Enter an integer.",
    "interaction.validation.boolean": "Enter true/false or yes/no.",
    "interaction.validation.arrayRequired": "Enter at least one value.",
    "interaction.validation.arrayOptional": "Enter at least one value, or click Skip.",
    "interaction.validation.empty": "The answer cannot be empty.",
    "interaction.validation.invalidValue": "The entered value is not valid.",
    "interaction.validation.allowedValues": "Allowed values: {values}.",
    "interaction.detail.directory": "Directory: {value}",
    "interaction.detail.grantRoot": "Grant root: {value}"
  }
} as const;

export type LocaleKey = keyof typeof LOCALE_COPY.en;

export function t(
  language: UiLanguage,
  key: LocaleKey,
  params: Record<string, string | number> = {}
): string {
  let value: string = LOCALE_COPY[language][key];
  for (const [name, replacement] of Object.entries(params)) {
    value = value.replaceAll(`{${name}}`, String(replacement));
  }
  return value;
}
