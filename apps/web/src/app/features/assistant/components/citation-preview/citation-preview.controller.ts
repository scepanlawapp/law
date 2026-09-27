import {
  OverlayRef,
  createFlexibleConnectedPositionStrategy,
  createOverlayRef,
} from "@angular/cdk/overlay";
import { ComponentPortal } from "@angular/cdk/portal";
import { DestroyRef, Injectable, Injector, inject } from "@angular/core";
import { LegalCitationResponse } from "@law/api-interfaces";
import { CitationPreviewComponent } from "./citation-preview";

const SHOW_DELAY_MS = 250;
const HIDE_DELAY_MS = 150;

let nextPreviewId = 0;

/**
 * Opens one citation preview overlay at a time, anchored to a `[n]` marker. Markers are
 * rendered through sanitized `[innerHTML]`, so the host component forwards hover/focus events.
 * Provide it on the component that owns the markers.
 */
@Injectable()
export class CitationPreviewController {
  private readonly injector = inject(Injector);
  private readonly previewId = `citation-preview-${nextPreviewId++}`;
  private overlayRef: OverlayRef | null = null;
  private anchor: HTMLElement | null = null;
  private showTimer: ReturnType<typeof setTimeout> | undefined;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  // Previews float over a scrolling transcript; close rather than drift from the marker.
  private readonly onScroll = () => this.hide();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.hide());
  }

  get isOpen(): boolean {
    return this.overlayRef !== null;
  }

  open(anchor: HTMLElement, citation: LegalCitationResponse): void {
    this.cancelHide();
    clearTimeout(this.showTimer);
    if (anchor === this.anchor) return;
    this.showTimer = setTimeout(
      () => this.attach(anchor, citation),
      SHOW_DELAY_MS,
    );
  }

  /** Delayed so the pointer can cross the gap from the marker into the preview. */
  scheduleHide(): void {
    clearTimeout(this.showTimer);
    this.cancelHide();
    this.hideTimer = setTimeout(() => this.hide(), HIDE_DELAY_MS);
  }

  hide(): void {
    clearTimeout(this.showTimer);
    this.cancelHide();
    this.anchor?.removeAttribute("aria-describedby");
    this.anchor = null;
    if (!this.overlayRef) return;
    this.overlayRef.dispose();
    this.overlayRef = null;
    document.removeEventListener("scroll", this.onScroll, true);
  }

  private cancelHide(): void {
    clearTimeout(this.hideTimer);
    this.hideTimer = undefined;
  }

  private attach(anchor: HTMLElement, citation: LegalCitationResponse): void {
    this.hide();
    if (!anchor.isConnected) return;

    const positionStrategy = createFlexibleConnectedPositionStrategy(
      this.injector,
      anchor,
    )
      .withPositions([
        {
          originX: "center",
          originY: "bottom",
          overlayX: "center",
          overlayY: "top",
          offsetY: 6,
        },
        {
          originX: "center",
          originY: "top",
          overlayX: "center",
          overlayY: "bottom",
          offsetY: -6,
        },
      ])
      .withViewportMargin(8)
      .withPush(false);
    const overlayRef = createOverlayRef(this.injector, { positionStrategy });
    const preview = overlayRef.attach(
      new ComponentPortal(CitationPreviewComponent),
    );
    preview.setInput("citation", citation);
    preview.setInput("previewId", this.previewId);
    preview.changeDetectorRef.detectChanges();
    overlayRef.updatePosition();

    const element = overlayRef.overlayElement;
    element.addEventListener("mouseenter", () => this.cancelHide());
    element.addEventListener("mouseleave", () => this.scheduleHide());
    element.addEventListener("focusout", (event) => {
      if (!element.contains(event.relatedTarget as Node | null)) {
        this.scheduleHide();
      }
    });
    element.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.hide();
    });
    document.addEventListener("scroll", this.onScroll, true);

    anchor.setAttribute("aria-describedby", this.previewId);
    this.anchor = anchor;
    this.overlayRef = overlayRef;
  }
}
