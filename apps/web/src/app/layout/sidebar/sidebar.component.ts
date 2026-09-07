import { Component } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { RouterLink, RouterLinkActive } from "@angular/router";

@Component({
  selector: "app-sidebar",
  standalone: true,
  templateUrl: "./sidebar.component.html",
  styleUrl: "./sidebar.component.scss",
  imports: [MatIconModule, RouterLink, RouterLinkActive],
})
export class SidebarComponent {}
