type ValueOf<T> = T[keyof T];

/** Team-tab member filter. */
export const RevenueMemberFilter = {
  ACTIVE: "ACTIVE",
  FORMER: "FORMER",
  ALL: "ALL",
} as const;
export type RevenueMemberFilter = ValueOf<typeof RevenueMemberFilter>;

/** Agreement self-origination choice; `INHERIT` stores `null`. */
export const RevenueSelfOrigination = {
  INHERIT: "INHERIT",
  YES: "YES",
  NO: "NO",
} as const;
export type RevenueSelfOrigination = ValueOf<typeof RevenueSelfOrigination>;

export const RevenueRuleActivity = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
} as const;
export type RevenueRuleActivity = ValueOf<typeof RevenueRuleActivity>;

/** Revenue editor tabs, in display order. */
export const RevenueTab = {
  OVERVIEW: "overview",
  MODELS: "models",
  TEAM: "team",
  SPECIAL: "special",
  HISTORY: "history",
} as const;
export type RevenueTab = ValueOf<typeof RevenueTab>;

/** Where a published version sits relative to today. */
export const RevenueVersionStatus = {
  CURRENT: "CURRENT",
  SCHEDULED: "SCHEDULED",
  HISTORICAL: "HISTORICAL",
  UNKNOWN: "UNKNOWN",
} as const;
export type RevenueVersionStatus = ValueOf<typeof RevenueVersionStatus>;
