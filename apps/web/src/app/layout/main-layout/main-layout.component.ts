import { toSignal } from "@angular/core/rxjs-interop";
import { filter, map } from "rxjs";
import { Component, computed, inject } from "@angular/core";
import { SidebarComponent } from "../sidebar/sidebar.component";
import { HeaderComponent } from "../header/header.component";
import { NavigationEnd, Router, RouterModule } from "@angular/router";
import { HlmSidebarInset, HlmSidebarWrapper } from "@spartan-ng/helm/sidebar";
import { QuickCaptureDialogService } from "../../features/time/quick-capture/quick-capture-dialog.service";
import { WorkTimerStore } from "../../features/time/timer/work-timer.store";

@Component({
  selector: "law-main-layout",
  standalone: true,
  host: {
    class: "block h-screen min-h-0 overflow-hidden",
    "(document:keydown.alt.w)": "openQuickCapture($event)",
  },
  templateUrl: "./main-layout.component.html",
  imports: [
    HeaderComponent,
    SidebarComponent,
    RouterModule,
    HlmSidebarInset,
    HlmSidebarWrapper,
  ],
})
export class MainLayoutComponent {
  private readonly router = inject(Router);
  private readonly pageUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  readonly accentPanels = computed(
    () => !/^\/(assistant|calendar)(?:[/?#;]|$)/.test(this.pageUrl()),
  );
  private readonly quickCapture = inject(QuickCaptureDialogService);

  constructor() {
    inject(WorkTimerStore).load();
  }

  openQuickCapture(event: Event): void {
    event.preventDefault();
    this.quickCapture.open({ mode: "create" }).subscribe();
  }
}
