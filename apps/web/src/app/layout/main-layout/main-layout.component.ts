import { Component } from "@angular/core";
import { SidebarComponent } from "../sidebar/sidebar.component";
import { HeaderComponent } from "../header/header.component";
import { RouterModule } from "@angular/router";

@Component({
  selector: "app-main-layout",
  standalone: true,
  host: {
    class: "grid h-screen min-h-0 grid-cols-[auto_1fr] overflow-hidden",
  },
  templateUrl: "./main-layout.component.html",
  imports: [HeaderComponent, SidebarComponent, RouterModule],
})
export class MainLayoutComponent {}
