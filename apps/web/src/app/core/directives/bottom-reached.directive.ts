import {
  Directive,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  inject,
} from "@angular/core";

@Directive({
  selector: "[appBottomReached]",
  standalone: true,
})
export class BottomReachedDirective {
  private readonly element = inject(ElementRef<HTMLElement>);

  @Input() bottomReachedThreshold = 64;
  @Output() readonly bottomReached = new EventEmitter<void>();

  private atBottom = false;

  @HostListener("scroll")
  protected onScroll(): void {
    const element = this.element.nativeElement;
    const reachedBottom =
      element.scrollTop + element.clientHeight >=
      element.scrollHeight - this.bottomReachedThreshold;

    if (reachedBottom && !this.atBottom) {
      this.bottomReached.emit();
    }
    this.atBottom = reachedBottom;
  }
}
