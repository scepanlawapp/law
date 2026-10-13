import { HlmInput } from "./lib/hlm-input";

export * from "./lib/hlm-input";

export const HlmInputImports = [HlmInput] as const;

export {
  HlmNumberInput,
  HLM_INPUT_NUMBER_LOCALE,
} from "./lib/hlm-number-input";
export type { HlmNumberLocale } from "./lib/number-format";
