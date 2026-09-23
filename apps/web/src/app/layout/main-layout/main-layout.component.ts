import { Component } from "@angular/core";
import { SidebarComponent } from "../sidebar/sidebar.component";
import { HeaderComponent } from "../header/header.component";
import { RouterModule } from "@angular/router";
import { HlmSidebarInset, HlmSidebarWrapper } from "@spartan-ng/helm/sidebar";

@Component({
  selector: "law-main-layout",
  standalone: true,
  host: { class: "block h-screen min-h-0 overflow-hidden" },
  templateUrl: "./main-layout.component.html",
  imports: [
    HeaderComponent,
    SidebarComponent,
    RouterModule,
    HlmSidebarInset,
    HlmSidebarWrapper,
  ],
})
export class MainLayoutComponent {}
