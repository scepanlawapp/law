/** Shared semantic-token styling for compact domain status and priority badges. */
export const STATUS_BADGE_BASE_CLASSES =
  "inline-flex items-center rounded-full border px-2 py-0.5 text-sm font-medium whitespace-nowrap";

const SUCCESS = "border-success/40 bg-success/10 text-success";
const WARNING = "border-warning/40 bg-warning/10 text-warning";
const INFO = "border-info/40 bg-info/10 text-info";
const DESTRUCTIVE = "border-destructive/40 bg-destructive/10 text-destructive";
const MUTED = "border-border bg-muted text-muted-foreground";

export function statusBadgeClass(status: string): string {
  switch (status) {
    case "ACTIVE":
    case "DONE":
    case "COMPLETED":
    case "SATISFIED":
    case "CONFIRMED":
    case "SENT":
      return SUCCESS;
    case "RUNNING":
    case "IN_PROGRESS":
    case "BILLED":
    case "PROSPECT":
      return INFO;
    case "PROPOSED":
    case "ON_HOLD":
    case "SCHEDULED":
      return WARNING;
    case "CANCELLED":
    case "VOIDED":
    case "WRITTEN_OFF":
      return DESTRUCTIVE;
    case "DRAFT":
    case "TODO":
    case "OPEN":
    case "CLOSED":
    case "ARCHIVED":
    case "INACTIVE":
    default:
      return MUTED;
  }
}

export function priorityBadgeClass(priority: string): string {
  switch (priority) {
    case "LOW":
      return INFO;
    case "HIGH":
      return WARNING;
    case "URGENT":
      return DESTRUCTIVE;
    case "NORMAL":
    default:
      return MUTED;
  }
}
