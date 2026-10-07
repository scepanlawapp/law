# @law/legal-deadlines

Deadlines from served documents. It holds the Serbian non-working-day calendar, the rules table and the day counting, which are deterministic. It also holds the classification schema, prompt and runner that recognize the act from its text, and `interpretDeadlineClassification`, which turns a classification into a computed deadline. The Mastra `deadline-detection` workflow in `@law/mastra` orchestrates these pieces. The model never computes a date.
