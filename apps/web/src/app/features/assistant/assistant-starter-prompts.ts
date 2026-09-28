/**
 * Starter cards on an empty assistant chat. Each prompt is phrased for an
 * existing assistant tool (agenda, work items, cases, legal sources, drafting).
 * `send` prompts are complete questions; `compose` prompts are stems the user
 * finishes in the composer.
 */
export type StarterPromptMode = "send" | "compose";

export interface AssistantStarterPrompt {
  id: string;
  icon: string;
  mode: StarterPromptMode;
}

export const GENERAL_STARTER_PROMPTS: readonly AssistantStarterPrompt[] = [
  { id: "agendaToday", icon: "lucideCalendarDays", mode: "send" },
  { id: "deadlinesSoon", icon: "lucideAlarmClock", mode: "send" },
  { id: "myTasks", icon: "lucideListChecks", mode: "send" },
  { id: "overdue", icon: "lucideCircleAlert", mode: "send" },
  { id: "hearingsWeek", icon: "lucideGavel", mode: "send" },
  { id: "myCases", icon: "lucideBriefcase", mode: "send" },
  { id: "clientOverview", icon: "lucideUser", mode: "compose" },
  { id: "researchLaw", icon: "lucideBookOpen", mode: "compose" },
  { id: "tariff", icon: "lucideReceipt", mode: "compose" },
  { id: "draftLawsuit", icon: "lucideFilePen", mode: "compose" },
  { id: "analyzeDocument", icon: "lucideFileSearch", mode: "compose" },
  { id: "setDeadline", icon: "lucideCalendarPlus", mode: "compose" },
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
  part: "title" | "description" | "prompt",
): string {
  return `assistant.starter.${prompt.id}.${part}`;
}
