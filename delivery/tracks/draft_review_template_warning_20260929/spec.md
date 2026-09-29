# Draft Review Template Warning Specification

## Problem

The draft-review placeholder map is typed as a complete `Record<string, string>` even though it starts empty. Angular therefore reports NG8102 for defensive nullish fallbacks in the template, while removing those fallbacks would make `.trim()` unsafe for an unfilled placeholder.

## Included

- Represent placeholder values as a partial record.
- Preserve the template's empty-string fallbacks.
- Verify that the Angular build no longer reports NG8102 for the draft review panel.

## Excluded

- Changes to draft placeholder behavior, styling, or unrelated build warnings.
