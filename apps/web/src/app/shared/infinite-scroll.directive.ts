import {
  Directive,
  DestroyRef,
  ElementRef,
  inject,
  output,
} from "@angular/core";

/**
 * Emits when the host element scrolls into (or near) the viewport. Render the
 * host only while more data can load, so a re-render re-checks visibility.
 */
@Directive({
  selector: "[lawInfiniteScroll]",
  standalone: true,
})
export class InfiniteScrollDirective {
  readonly lawInfiniteScroll = output<void>();

  constructor() {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (records) => {
        if (records.some((record) => record.isIntersecting))
          this.lawInfiniteScroll.emit();
      },
      { rootMargin: "200px" },
    );
    observer.observe(inject(ElementRef<HTMLElement>).nativeElement);
    inject(DestroyRef).onDestroy(() => observer.disconnect());
  }
}
