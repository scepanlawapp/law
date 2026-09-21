import { Component } from "@angular/core";
import { NgIcon, provideIcons } from "@ng-icons/core";
import {
  lucideBell,
  lucideDatabase,
  lucidePalette,
  lucideSettings,
  lucideUser,
} from "@ng-icons/lucide";
import { RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";
import { TranslatePipe } from "../../core/localization/translate.pipe";

@Component({
  selector: "app-settings",
  standalone: true,
  templateUrl: "./settings.component.html",
  styleUrl: "./settings.component.scss",
  host: {
    class: "block min-w-0",
  },
  imports: [NgIcon, RouterLink, RouterLinkActive, RouterOutlet, TranslatePipe],
  providers: [
    provideIcons({
      lucideBell,
      lucideDatabase,
      lucidePalette,
      lucideSettings,
      lucideUser,
    }),
  ],
})
export class SettingsComponent {
  readonly menu = [
    { path: "profile", label: "settings.profile", icon: "lucideUser" },
    { path: "appearance", label: "settings.appearance", icon: "lucidePalette" },
    { path: "workspace", label: "settings.workspace", icon: "lucideBell" },
    { path: "data", label: "settings.data", icon: "lucideDatabase" },
  ];
}
