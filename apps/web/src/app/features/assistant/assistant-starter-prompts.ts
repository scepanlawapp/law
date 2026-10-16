/**
 * Starter cards on an empty assistant chat. Each prompt is phrased for an
 * existing assistant tool (agenda, work items, cases, legal sources, drafting
 * by document type).
 * `send` prompts are complete questions; `compose` prompts are stems the user
 * finishes in the composer. A card with `pick` first asks the user to choose a
 * client, case, colleague, or document; its prompt takes the choice as the
 * `{client}`, `{case}`, `{person}`, or `{document}` parameter.
 */
import { LabelMap } from "../../shared/models";

export const StarterPromptMode = {
  SEND: "send",
  COMPOSE: "compose",
} as const;
export type StarterPromptMode =
  (typeof StarterPromptMode)[keyof typeof StarterPromptMode];

/** Also the prompt parameter name the picked reference fills. */
export const StarterPickKind = {
  CLIENT: "client",
  CASE: "case",
  PERSON: "person",
  DOCUMENT: "document",
} as const;
export type StarterPickKind =
  (typeof StarterPickKind)[keyof typeof StarterPickKind];

export const StarterPromptGroup = {
  WORK: "work",
  MATTERS: "matters",
  LEGAL: "legal",
  DRAFTING: "drafting",
} as const;
export type StarterPromptGroup =
  (typeof StarterPromptGroup)[keyof typeof StarterPromptGroup];

/** In display order. */
export const STARTER_PROMPT_GROUP_LABELS: LabelMap<StarterPromptGroup> = {
  [StarterPromptGroup.WORK]: "assistant.starter.group.work",
  [StarterPromptGroup.MATTERS]: "assistant.starter.group.matters",
  [StarterPromptGroup.LEGAL]: "assistant.starter.group.legal",
  [StarterPromptGroup.DRAFTING]: "assistant.starter.group.drafting",
};

export interface StarterPickerCopy {
  title: string;
  description: string;
  search: string;
}

export const STARTER_PICKER_LABELS: Readonly<
  Record<StarterPickKind, StarterPickerCopy>
> = {
  [StarterPickKind.CLIENT]: {
    title: "assistant.starter.picker.client.title",
    description: "assistant.starter.picker.client.description",
    search: "assistant.starter.picker.client.search",
  },
  [StarterPickKind.CASE]: {
    title: "assistant.starter.picker.case.title",
    description: "assistant.starter.picker.case.description",
    search: "assistant.starter.picker.case.search",
  },
  [StarterPickKind.PERSON]: {
    title: "assistant.starter.picker.person.title",
    description: "assistant.starter.picker.person.description",
    search: "assistant.starter.picker.person.search",
  },
  [StarterPickKind.DOCUMENT]: {
    title: "assistant.starter.picker.document.title",
    description: "assistant.starter.picker.document.description",
    search: "assistant.starter.picker.document.search",
  },
};

export interface AssistantStarterPrompt {
  id: string;
  icon: string;
  mode: StarterPromptMode;
  pick?: StarterPickKind;
  group?: StarterPromptGroup;
}

/** A picked record; `reference` is the text the assistant's tools resolve exactly. */
export interface StarterPick {
  id: string;
  label: string;
  detail: string | null;
  reference: string;
}

/** The document picker can hand off to attaching a new file instead. */
export const STARTER_PICKER_ATTACH = "attach";
export type StarterPickerResult =
  | StarterPick
  | typeof STARTER_PICKER_ATTACH
  | undefined;

export const STARTER_PROMPT_GROUPS = Object.keys(
  STARTER_PROMPT_GROUP_LABELS,
) as StarterPromptGroup[];

const { SEND, COMPOSE } = StarterPromptMode;
const { CLIENT, CASE, PERSON, DOCUMENT } = StarterPickKind;
const { WORK, MATTERS, LEGAL, DRAFTING } = StarterPromptGroup;

export const GENERAL_STARTER_PROMPTS: readonly AssistantStarterPrompt[] = [
  { id: "agendaToday", icon: "lucideCalendarDays", mode: SEND, group: WORK },
  { id: "deadlinesSoon", icon: "lucideAlarmClock", mode: SEND, group: WORK },
  { id: "myTasks", icon: "lucideListChecks", mode: SEND, group: WORK },
  { id: "overdue", icon: "lucideCircleAlert", mode: SEND, group: WORK },
  { id: "hearingsWeek", icon: "lucideGavel", mode: SEND, group: WORK },
  { id: "logDayWork", icon: "lucideClock", mode: SEND, group: WORK },
  {
    id: "colleagueAgenda",
    icon: "lucideUsers",
    mode: SEND,
    pick: PERSON,
    group: WORK,
  },
  { id: "myCases", icon: "lucideBriefcase", mode: SEND, group: MATTERS },
  {
    id: "caseOverview",
    icon: "lucideBriefcase",
    mode: SEND,
    pick: CASE,
    group: MATTERS,
  },
  {
    id: "pickedCaseWork",
    icon: "lucideListChecks",
    mode: SEND,
    pick: CASE,
    group: MATTERS,
  },
  {
    id: "pickedCaseActivity",
    icon: "lucideHistory",
    mode: SEND,
    pick: CASE,
    group: MATTERS,
  },
  {
    id: "clientOverview",
    icon: "lucideUser",
    mode: SEND,
    pick: CLIENT,
    group: MATTERS,
  },
  {
    id: "clientBilling",
    icon: "lucideReceipt",
    mode: SEND,
    pick: CLIENT,
    group: MATTERS,
  },
  { id: "researchLaw", icon: "lucideBookOpen", mode: COMPOSE, group: LEGAL },
  { id: "tariff", icon: "lucideReceipt", mode: COMPOSE, group: LEGAL },
  {
    id: "draftLawsuit",
    icon: "lucideFilePen",
    mode: COMPOSE,
    pick: CASE,
    group: DRAFTING,
  },
  {
    id: "draftDefence",
    icon: "lucideFilePen",
    mode: COMPOSE,
    pick: DOCUMENT,
    group: DRAFTING,
  },
  {
    id: "draftAppeal",
    icon: "lucideFilePen",
    mode: COMPOSE,
    pick: DOCUMENT,
    group: DRAFTING,
  },
  {
    id: "draftEnforcement",
    icon: "lucideFilePen",
    mode: COMPOSE,
    pick: CASE,
    group: DRAFTING,
  },
  {
    id: "draftContract",
    icon: "lucideFilePen",
    mode: COMPOSE,
    pick: CLIENT,
    group: DRAFTING,
  },
  {
    id: "draftDemandLetter",
    icon: "lucideFilePen",
    mode: COMPOSE,
    pick: CASE,
    group: DRAFTING,
  },
  {
    id: "draftMediaReply",
    icon: "lucideFilePen",
    mode: COMPOSE,
    group: DRAFTING,
  },
  {
    id: "draftPowerOfAttorney",
    icon: "lucideFilePen",
    mode: COMPOSE,
    pick: CLIENT,
    group: DRAFTING,
  },
  {
    id: "setDeadline",
    icon: "lucideCalendarPlus",
    mode: COMPOSE,
    pick: CASE,
    group: DRAFTING,
  },
  {
    id: "deadlineFromDocument",
    icon: "lucideAlarmClock",
    mode: COMPOSE,
    pick: DOCUMENT,
    group: DRAFTING,
  },
  {
    id: "reviewContract",
    icon: "lucideFileSearch",
    mode: COMPOSE,
    pick: DOCUMENT,
    group: DRAFTING,
  },
  {
    id: "analyzeDocument",
    icon: "lucideFileSearch",
    mode: SEND,
    pick: DOCUMENT,
    group: DRAFTING,
  },
];

/** Shown when the chat is linked to a case; the agent scopes to that case. */
export const CASE_STARTER_PROMPTS: readonly AssistantStarterPrompt[] = [
  { id: "caseSummary", icon: "lucideBriefcase", mode: SEND },
  { id: "caseWork", icon: "lucideListChecks", mode: SEND },
  { id: "caseActivity", icon: "lucideHistory", mode: SEND },
  { id: "caseDocuments", icon: "lucideFileText", mode: SEND },
  { id: "caseTimeline", icon: "lucideHistory", mode: SEND },
  { id: "caseDraftLawsuit", icon: "lucideFilePen", mode: COMPOSE },
  { id: "caseDraftAppeal", icon: "lucideFilePen", mode: COMPOSE },
  { id: "caseDemandLetter", icon: "lucideFilePen", mode: COMPOSE },
  { id: "caseReviewContract", icon: "lucideFileSearch", mode: COMPOSE },
  { id: "caseSetDeadline", icon: "lucideCalendarPlus", mode: COMPOSE },
  {
    id: "caseDeadlineFromDocument",
    icon: "lucideAlarmClock",
    mode: COMPOSE,
  },
  { id: "researchLaw", icon: "lucideBookOpen", mode: COMPOSE },
];

export function starterPromptKey(
  prompt: AssistantStarterPrompt,
  part: "title" | "description" | "prompt" | "attachPrompt",
): string {
  return `assistant.starter.${prompt.id}.${part}`;
}
