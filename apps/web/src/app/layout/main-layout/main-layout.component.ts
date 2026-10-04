import { Component, inject } from "@angular/core";
import { SidebarComponent } from "../sidebar/sidebar.component";
import { HeaderComponent } from "../header/header.component";
import { RouterModule } from "@angular/router";
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
  private readonly quickCapture = inject(QuickCaptureDialogService);

  constructor() {
    inject(WorkTimerStore).load();
  }

  openQuickCapture(event: Event): void {
    event.preventDefault();
    this.quickCapture.open({ mode: "create" }).subscribe();
  }
}
