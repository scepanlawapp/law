# Shared numeric input formatting

All frontend `hlmInput` fields declared as `type="number"` or `inputmode="decimal"` display grouped numbers through the shared Helm input library. Serbian uses 1.234.567,89; English uses 1,234,567.89, following the active UI language. Integer fields remain integers, decimal fields display at least two decimal places without rounding away extra precision. Focused inputs omit grouping for reliable editing and caret movement; blur restores grouping.

Maintain existing Angular form model types (number/null for number inputs, canonical decimal strings for text decimal inputs), required/min/max/domain validation, touched/dirty/disabled/readonly states, programmatic updates and existing save payloads. Preserve exact precision for decimal-string money fields. Reject malformed values instead of silently parsing a prefix. Accept unambiguous pasted grouped numbers in either supported notation; ambiguous single separators follow the active locale. Keep normal text, dates, email, passwords, phone numbers and identifiers unchanged.

The library must not import app services. Supply the active locale from application composition via an injection token. No backend or database changes.
