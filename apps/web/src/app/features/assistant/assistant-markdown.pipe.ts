import { Pipe, PipeTransform, SecurityContext, inject } from "@angular/core";
import { DomSanitizer } from "@angular/platform-browser";
import { marked } from "marked";

@Pipe({
  name: "assistantMarkdown",
  standalone: true,
  pure: true,
})
export class AssistantMarkdownPipe implements PipeTransform {
  private readonly sanitizer = inject(DomSanitizer);

  transform(value: string): string {
    const html = marked.parse(value, {
      async: false,
      breaks: true,
      gfm: true,
    });
    return this.sanitizer.sanitize(SecurityContext.HTML, html) ?? "";
  }
}
