/**
 * Side-effect level of every assistant tool (AI_ARCHITECTURE.md §5):
 * `none` and `reversible` run immediately; `confirm` only stores a pending
 * action that a user must approve before anything changes.
 */
export const ASSISTANT_TOOL_SIDE_EFFECTS = {
  search_legal_sources: "none",
  get_case: "none",
  get_draft: "none",
  list_conversation_drafts: "none",
  draft_lawsuit: "reversible",
  revise_draft: "reversible",
  link_case: "confirm",
  create_deadline: "confirm",
  create_tasks_from_brief: "confirm",
} as const;

export type AssistantToolName = keyof typeof ASSISTANT_TOOL_SIDE_EFFECTS;
