import { TestBed } from "@angular/core/testing";
import { AssistantMarkdownPipe } from "./assistant-markdown.pipe";

describe("AssistantMarkdownPipe", () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it("renders useful Markdown formatting", () => {
    const pipe = TestBed.runInInjectionContext(() => new AssistantMarkdownPipe());

    const html = pipe.transform("## Naslov\n\n- Prva stavka\n- Druga stavka");

    expect(html).toContain("<h2>Naslov</h2>");
    expect(html).toContain("<li>Prva stavka</li>");
  });

  it("sanitizes scripts and unsafe links", () => {
    const pipe = TestBed.runInInjectionContext(() => new AssistantMarkdownPipe());

    const html = pipe.transform(
      '<script>alert("x")</script>\n[unsafe](javascript:alert("x"))',
    );

    expect(html).not.toContain("<script");
    expect(html).not.toContain('href="javascript:');
  });
});
