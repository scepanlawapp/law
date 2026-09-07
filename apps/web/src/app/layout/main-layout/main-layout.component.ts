import { Component } from "@angular/core";
import { SidebarComponent } from "../sidebar/sidebar.component";
import { HeaderComponent } from "../header/header.component";
import { RouterModule } from "@angular/router";

@Component({
  selector: "app-main-layout",
  standalone: true,
  host: {
    class:
      "grid min-h-screen grid-cols-[15rem_minmax(0,1fr)] bg-[var(--color-background)] max-[700px]:grid-cols-[4.25rem_minmax(0,1fr)]",
  },
  templateUrl: "./main-layout.component.html",
  imports: [HeaderComponent, SidebarComponent, RouterModule],
})
export class MainLayoutComponent {}
