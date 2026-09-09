# @law/transliteration

Dependency-free Serbian Cyrillic ↔ Latin transliteration.

- `toLatin(text)` — canonical normalization applied to every ingested text.
- `toCyrillic(text)` — outbound conversion for court submissions; protects URLs, emails, `[UNOS POTREBAN: …]` placeholders, legal abbreviations and foreign words.
- `detectScript(text)` — `LATIN | CYRILLIC | MIXED | NONE`.
