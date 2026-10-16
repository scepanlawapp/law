import { RetainerRule } from "@law/api-interfaces";
import { LabelMap } from "../select-option";

export const RETAINER_RULE_LABELS: LabelMap<RetainerRule> = {
  [RetainerRule.HOURLY]: "retainers.rule.HOURLY",
  [RetainerRule.AT]: "retainers.rule.AT",
  [RetainerRule.ABSORBED]: "retainers.rule.ABSORBED",
};
