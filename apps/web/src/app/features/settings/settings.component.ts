import { Component } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";
import { TranslatePipe } from "../../core/localization/translate.pipe";

@Component({
  selector: "app-settings",
  standalone: true,
  templateUrl: "./settings.component.html",
  styleUrl: "./settings.component.scss",
  imports: [
    MatIconModule,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    TranslatePipe,
  ],
})
export class SettingsComponent {
  readonly menu = [
    { path: "profile", label: "settings.profile", icon: "person" },
    { path: "appearance", label: "settings.appearance", icon: "palette" },
    { path: "workspace", label: "settings.workspace", icon: "notifications" },
    { path: "data", label: "settings.data", icon: "storage" },
  ];
}
