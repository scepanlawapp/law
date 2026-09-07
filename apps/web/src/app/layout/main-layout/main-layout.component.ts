import { Component } from "@angular/core";
import { SidebarComponent } from "../sidebar/sidebar.component";
import { HeaderComponent } from "../header/header.component";
import { RouterModule } from "@angular/router";

@Component({
  selector: "app-main-layout",
  standalone: true,
  templateUrl: "./main-layout.component.html",
  styleUrl: "./main-layout.component.scss",
  imports: [HeaderComponent, SidebarComponent, RouterModule],
})
export class MainLayoutComponent {}
