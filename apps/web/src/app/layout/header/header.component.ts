import { Component, signal } from "@angular/core";
import { NgIcon, provideIcons } from "@ng-icons/core";
import {
  lucideSearch,
  lucideBell,
  lucideArrowRight,
  lucideCreditCard,
  lucideFolderOpen,
  lucideMessageCircle,
  lucideTriangleAlert,
  lucideFileText,
  lucideCalendar,
  lucideUsers,
  lucideSquareCheck,
  lucideFileCheck,
  lucideInfo,
} from "@ng-icons/lucide";
import { RouterLink } from "@angular/router";
import { HlmDropdownMenuImports } from "@spartan-ng/helm/dropdown-menu";
import { TranslatePipe } from "../../core/localization/translate.pipe";

interface HeaderNotification {
  title: string;
  detail: string;
  time: string;
  icon: string;
  tone: "blue" | "orange" | "red" | "purple";
}

const LEGAL_QUOTE_KEYS = Array.from(
  { length: 120 },
  (_, index) => `header.quote${String(index + 1).padStart(2, "0")}`,
);

@Component({
  selector: "app-header",
  standalone: true,
  templateUrl: "./header.component.html",
  imports: [NgIcon, RouterLink, ...HlmDropdownMenuImports, TranslatePipe],
  providers: [
    provideIcons({
      lucideSearch,
      lucideBell,
      lucideArrowRight,
      lucideCreditCard,
      lucideFolderOpen,
      lucideMessageCircle,
      lucideTriangleAlert,
      lucideFileText,
      lucideCalendar,
      lucideUsers,
      lucideSquareCheck,
      lucideFileCheck,
      lucideInfo,
    }),
  ],
})
export class HeaderComponent {
  readonly quoteKey = signal(
    LEGAL_QUOTE_KEYS[Math.floor(Math.random() * LEGAL_QUOTE_KEYS.length)],
  );

  readonly notifications: HeaderNotification[] = [
    {
      title: "New document uploaded",
      detail: "Contract.pdf in case P-123/2026",
      time: "10m",
      icon: "lucideFileText",
      tone: "blue",
    },
    {
      title: "Hearing reminder",
      detail: "Court hearing tomorrow at 10:00",
      time: "1h",
      icon: "lucideCalendar",
      tone: "blue",
    },
    {
      title: "Deadline approaching",
      detail: "Submit appeal in 2 days",
      time: "3h",
      icon: "lucideTriangleAlert",
      tone: "red",
    },
    {
      title: "New message from client",
      detail: "Ana Jovanović",
      time: "5h",
      icon: "lucideMessageCircle",
      tone: "blue",
    },
    {
      title: "System update",
      detail: "Backup completed successfully",
      time: "1d",
      icon: "lucideInfo",
      tone: "purple",
    },
    {
      title: "Payment received",
      detail: "Invoice #INV-0042 was paid",
      time: "1d",
      icon: "lucideCreditCard",
      tone: "orange",
    },
    {
      title: "Case status changed",
      detail: "P-124/2026 is now Active",
      time: "2d",
      icon: "lucideFolderOpen",
      tone: "orange",
    },
    {
      title: "New client added",
      detail: "Nikola Petrović joined your workspace",
      time: "2d",
      icon: "lucideUsers",
      tone: "blue",
    },
    {
      title: "Task completed",
      detail: "Prepare response to court",
      time: "3d",
      icon: "lucideSquareCheck",
      tone: "purple",
    },
    {
      title: "Document review finished",
      detail: "Ugovor.pdf is ready for review",
      time: "3d",
      icon: "lucideFileCheck",
      tone: "blue",
    },
  ];
}
