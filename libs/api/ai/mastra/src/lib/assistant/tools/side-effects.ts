/**
 * Side-effect level of every assistant tool (AI_ARCHITECTURE.md §5):
 * `none` and `reversible` run immediately; `confirm` only stores a pending
 * action that a user must approve before anything changes.
 */
export const ASSISTANT_TOOL_SIDE_EFFECTS = {
  search_legal_sources: "none",
  get_case: "none",
  search_cases: "none",
  search_clients: "none",
  get_client: "none",
  list_work_items: "none",
  get_agenda: "none",
  list_activity: "none",
  list_documents: "none",
  read_document: "none",
  search_documents: "none",
  get_draft: "none",
  list_conversation_drafts: "none",
  draft_document: "reversible",
  revise_draft: "reversible",
  review_contract: "reversible",
  summarize_case_documents: "reversible",
  link_case: "confirm",
  create_deadline: "confirm",
  detect_deadlines: "confirm",
  create_tasks_from_brief: "confirm",
} as const;

export type AssistantToolName = keyof typeof ASSISTANT_TOOL_SIDE_EFFECTS;
