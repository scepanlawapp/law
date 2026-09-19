# legal-grounding

Builds legal-knowledge search queries from a `BriefResult` or free text, retrieves and
deduplicates the resulting chunks (score-thresholded, capped, marker-numbered), and
formats them as a citation context block for drafting/answering prompts.
