/** How the due target of a task or deadline is entered. */
export const DueTargetMode = {
  NONE: "NONE",
  DATE: "DATE",
  DATE_TIME: "DATE_TIME",
} as const;
export type DueTargetMode = (typeof DueTargetMode)[keyof typeof DueTargetMode];
