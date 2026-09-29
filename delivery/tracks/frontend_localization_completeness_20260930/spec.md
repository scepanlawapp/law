# Frontend Localization Completeness Specification

## Problem

The case-detail document table references translation keys that are absent from both locale catalogs, so users see raw keys. The Serbian catalog also lacks the sidebar main-navigation accessible label that exists in English.

## Scope

- Add Serbian and English labels for the document title, category, and creation-date keys used by case detail.
- Add the missing Serbian main-navigation accessible label.
- Audit static frontend translation references and keep the Serbian and English catalogs aligned.

## Out of scope

- Rewording existing translations.
- Replacing or restructuring localization infrastructure.
- Changing the existing case-detail layout or behavior.

## Acceptance criteria

- Case-detail document headers render translated text in Serbian and English.
- The sidebar main-navigation accessible label is translated in Serbian.
- No statically referenced frontend translation key is missing from either catalog.
