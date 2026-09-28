/**
 * Starter cards on an empty assistant chat. Each prompt is phrased for an
 * existing assistant tool (agenda, work items, cases, legal sources, drafting).
 * `send` prompts are complete questions; `compose` prompts are stems the user
 * finishes in the composer. A card with `pick` first asks the user to choose a
 * client, case, colleague, or document; its prompt takes the choice as the
 * `{client}`, `{case}`, `{person}`, or `{document}` parameter.
 */
export type StarterPromptMode = "send" | "compose";
export type StarterPickKind = "client" | "case" | "person" | "document";
export type StarterPromptGroup = "work" | "matters" | "legal" | "drafting";

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
export type StarterPickerResult = StarterPick | "attach" | undefined;

export const STARTER_PROMPT_GROUPS: readonly StarterPromptGroup[] = [
  "work",
  "matters",
  "legal",
  "drafting",
];

export const GENERAL_STARTER_PROMPTS: readonly AssistantStarterPrompt[] = [
  { id: "agendaToday", icon: "lucideCalendarDays", mode: "send", group: "work" },
  { id: "deadlinesSoon", icon: "lucideAlarmClock", mode: "send", group: "work" },
  { id: "myTasks", icon: "lucideListChecks", mode: "send", group: "work" },
  { id: "overdue", icon: "lucideCircleAlert", mode: "send", group: "work" },
  { id: "hearingsWeek", icon: "lucideGavel", mode: "send", group: "work" },
  {
    id: "colleagueAgenda",
    icon: "lucideUsers",
    mode: "send",
    pick: "person",
    group: "work",
  },
  { id: "myCases", icon: "lucideBriefcase", mode: "send", group: "matters" },
  {
    id: "caseOverview",
    icon: "lucideBriefcase",
    mode: "send",
    pick: "case",
    group: "matters",
  },
  {
    id: "pickedCaseWork",
    icon: "lucideListChecks",
    mode: "send",
    pick: "case",
    group: "matters",
  },
  {
    id: "pickedCaseActivity",
    icon: "lucideHistory",
    mode: "send",
    pick: "case",
    group: "matters",
  },
  {
    id: "clientOverview",
    icon: "lucideUser",
    mode: "send",
    pick: "client",
    group: "matters",
  },
  { id: "researchLaw", icon: "lucideBookOpen", mode: "compose", group: "legal" },
  { id: "tariff", icon: "lucideReceipt", mode: "compose", group: "legal" },
  {
    id: "draftLawsuit",
    icon: "lucideFilePen",
    mode: "compose",
    pick: "case",
    group: "drafting",
  },
  {
    id: "setDeadline",
    icon: "lucideCalendarPlus",
    mode: "compose",
    pick: "case",
    group: "drafting",
  },
  {
    id: "analyzeDocument",
    icon: "lucideFileSearch",
    mode: "send",
    pick: "document",
    group: "drafting",
  },
];

/** Shown when the chat is linked to a case; the agent scopes to that case. */
export const CASE_STARTER_PROMPTS: readonly AssistantStarterPrompt[] = [
  { id: "caseSummary", icon: "lucideBriefcase", mode: "send" },
  { id: "caseWork", icon: "lucideListChecks", mode: "send" },
  { id: "caseActivity", icon: "lucideHistory", mode: "send" },
  { id: "caseDocuments", icon: "lucideFileText", mode: "send" },
  { id: "caseDraftLawsuit", icon: "lucideFilePen", mode: "compose" },
  { id: "caseSetDeadline", icon: "lucideCalendarPlus", mode: "compose" },
  { id: "researchLaw", icon: "lucideBookOpen", mode: "compose" },
];

export function starterPromptKey(
  prompt: AssistantStarterPrompt,
  part: "title" | "description" | "prompt" | "attachPrompt",
): string {
  return `assistant.starter.${prompt.id}.${part}`;
}
