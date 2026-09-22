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
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmInputGroupImports } from "@spartan-ng/helm/input-group";
import { TranslatePipe } from "../../core/localization/translate.pipe";

interface HeaderNotification {
  titleKey: string;
  detailKey: string;
  time: string;
  icon: string;
  tone: "blue" | "orange" | "red" | "purple";
}

const LEGAL_QUOTE_KEYS = Array.from(
  { length: 120 },
  (_, index) => `header.quote${String(index + 1).padStart(2, "0")}`,
);

@Component({
  selector: "law-header",
  standalone: true,
  templateUrl: "./header.component.html",
  imports: [
    NgIcon,
    RouterLink,
    ...HlmDropdownMenuImports,
    HlmButton,
    HlmInputGroupImports,
    TranslatePipe,
  ],
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
      titleKey: "header.notification.documentUploaded",
      detailKey: "header.notification.documentUploadedDetail",
      time: "10m",
      icon: "lucideFileText",
      tone: "blue",
    },
    {
      titleKey: "header.notification.hearingReminder",
      detailKey: "header.notification.hearingReminderDetail",
      time: "1h",
      icon: "lucideCalendar",
      tone: "blue",
    },
    {
      titleKey: "header.notification.deadlineApproaching",
      detailKey: "header.notification.deadlineApproachingDetail",
      time: "3h",
      icon: "lucideTriangleAlert",
      tone: "red",
    },
    {
      titleKey: "header.notification.newClientMessage",
      detailKey: "header.notification.newClientMessageDetail",
      time: "5h",
      icon: "lucideMessageCircle",
      tone: "blue",
    },
    {
      titleKey: "header.notification.systemUpdate",
      detailKey: "header.notification.systemUpdateDetail",
      time: "1d",
      icon: "lucideInfo",
      tone: "purple",
    },
    {
      titleKey: "header.notification.paymentReceived",
      detailKey: "header.notification.paymentReceivedDetail",
      time: "1d",
      icon: "lucideCreditCard",
      tone: "orange",
    },
    {
      titleKey: "header.notification.caseStatusChanged",
      detailKey: "header.notification.caseStatusChangedDetail",
      time: "2d",
      icon: "lucideFolderOpen",
      tone: "orange",
    },
    {
      titleKey: "header.notification.newClientAdded",
      detailKey: "header.notification.newClientAddedDetail",
      time: "2d",
      icon: "lucideUsers",
      tone: "blue",
    },
    {
      titleKey: "header.notification.taskCompleted",
      detailKey: "header.notification.taskCompletedDetail",
      time: "3d",
      icon: "lucideSquareCheck",
      tone: "purple",
    },
    {
      titleKey: "header.notification.documentReviewFinished",
      detailKey: "header.notification.documentReviewFinishedDetail",
      time: "3d",
      icon: "lucideFileCheck",
      tone: "blue",
    },
  ];
}
