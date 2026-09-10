import { Component } from "@angular/core";
import { NgIcon, provideIcons } from "@ng-icons/core";
import {
  lucideScale,
  lucideBot,
  lucideHome,
  lucideUsers,
  lucideFolder,
  lucideFileText,
  lucideSquareCheck,
  lucideCalendar,
  lucideLandmark,
  lucideChartBar,
  lucideSettings,
} from "@ng-icons/lucide";
import { RouterLink, RouterLinkActive } from "@angular/router";
import { TranslatePipe } from "../../core/localization/translate.pipe";

@Component({
  selector: "app-sidebar",
  standalone: true,
  templateUrl: "./sidebar.component.html",
  imports: [NgIcon, RouterLink, RouterLinkActive, TranslatePipe],
  providers: [
    provideIcons({
      lucideScale,
      lucideBot,
      lucideHome,
      lucideUsers,
      lucideFolder,
      lucideFileText,
      lucideSquareCheck,
      lucideCalendar,
      lucideLandmark,
      lucideChartBar,
      lucideSettings,
    }),
  ],
})
export class SidebarComponent {}
