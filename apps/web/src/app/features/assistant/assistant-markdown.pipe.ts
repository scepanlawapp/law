import { Pipe, PipeTransform, SecurityContext, inject } from "@angular/core";
import { DomSanitizer } from "@angular/platform-browser";
import { marked } from "marked";

const CITATION_MARKER_PATTERN = /\[(\d{1,2})]/g;

@Pipe({
  name: "assistantMarkdown",
  standalone: true,
  pure: true,
})
export class AssistantMarkdownPipe implements PipeTransform {
  private readonly sanitizer = inject(DomSanitizer);

  /** `anchorPrefix` must match the `idPrefix` of the message's citation list. */
  transform(
    value: string,
    citationMarkers: readonly number[] = [],
    anchorPrefix = "citation",
  ): string {
    const html = marked.parse(value, {
      async: false,
      breaks: true,
      gfm: true,
    });
    const linked = citationMarkers.length
      ? linkifyCitationMarkers(html, citationMarkers, anchorPrefix)
      : html;
    return this.sanitizer.sanitize(SecurityContext.HTML, linked) ?? "";
  }
}

/** Turns [n] markers the assistant produced into jump links to the matching Izvori entry. */
function linkifyCitationMarkers(
  html: string,
  markers: readonly number[],
  anchorPrefix: string,
): string {
  const markerSet = new Set(markers);
  return html.replace(CITATION_MARKER_PATTERN, (match, digits: string) => {
    const marker = Number(digits);
    if (!markerSet.has(marker)) return match;
    return `<sup><a href="#${anchorPrefix}-${marker}" class="citation-marker-link">${marker}</a></sup>`;
  });
}

