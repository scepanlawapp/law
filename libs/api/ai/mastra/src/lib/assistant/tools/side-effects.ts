/**
 * Side-effect level of every assistant tool (AI_ARCHITECTURE.md §5):
 * `none` and `reversible` run immediately; `confirm` only stores a pending
 * action, and the user's permission mode decides whether it is a prefilled
 * form, an approval card, or (where the action allows it) saved directly.
 */
export const ASSISTANT_TOOL_SIDE_EFFECTS = {
  search_legal_sources: "none",
  get_case: "none",
  search_cases: "none",
  search_clients: "none",
  get_client: "none",
  list_work_items: "none",
  get_agenda: "none",
  get_day_work: "none",
  get_client_billing: "none",
  list_receivables: "none",
  list_activity: "none",
  list_documents: "none",
  read_document: "none",
  search_documents: "none",
  search_case_documents: "none",
  get_document_facts: "none",
  get_draft: "none",
  list_conversation_drafts: "none",
  draft_document: "reversible",
  revise_draft: "reversible",
  review_contract: "reversible",
  summarize_case_documents: "reversible",
  link_case: "confirm",
  create_deadline: "confirm",
  create_event: "confirm",
  reschedule_event: "confirm",
  cancel_event: "confirm",
  create_task: "confirm",
  log_work_entry: "confirm",
  log_work_entries: "confirm",
  detect_deadlines: "confirm",
  create_tasks_from_brief: "confirm",
  propose_client_update_from_document: "confirm",
} as const;

export type AssistantToolName = keyof typeof ASSISTANT_TOOL_SIDE_EFFECTS;
