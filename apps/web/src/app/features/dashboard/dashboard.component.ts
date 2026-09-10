import { Component, inject, signal } from "@angular/core";
import { FormControl, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { NgIcon, provideIcons } from "@ng-icons/core";
import {
  lucideArrowRight,
  lucideBot,
  lucideCalendar,
  lucideChevronRight,
  lucideFileText,
  lucideFolderOpen,
  lucideGavel,
  lucideInfo,
  lucideMessageCircle,
  lucideSparkles,
  lucideSquareCheck,
  lucideTriangleAlert,
  lucideUpload,
  lucideUsers,
  lucideWallet,
} from "@ng-icons/lucide";
import { Router, RouterLink } from "@angular/router";
import { ChatApiClient } from "@law/api-clients";
import { AuthState } from "@law/security";
import { DashboardStatCardComponent } from "../../shared/components/dashboard-stat-card/dashboard-stat-card.component";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { LocalizationService } from "../../core/localization/localization.service";

type CaseStatus = "Active" | "Pending" | "Closed";

interface DashboardEvent {
  time: string;
  title: string;
  detail: string;
  icon: string;
  tag: string;
}

interface DashboardActivity {
  title: string;
  detail: string;
  time: string;
  icon: string;
  tone: "blue" | "orange" | "green" | "purple";
}

interface DashboardNotification {
  title: string;
  detail: string;
  time: string;
  icon: string;
  tone: "blue" | "orange" | "red" | "purple";
}

interface CaseOverview {
  number: string;
  client: string;
  type: string;
  status: CaseStatus;
  statusClass: Lowercase<CaseStatus>;
  court: string;
  deadline: string;
}

interface QuickAction {
  title: string;
  icon: string;
}

@Component({
  selector: "app-dashboard",
  standalone: true,
  imports: [
    DashboardStatCardComponent,
    NgIcon,
    ReactiveFormsModule,
    RouterLink,
    TranslatePipe,
  ],
  templateUrl: "./dashboard.component.html",
  styleUrl: "./dashboard.component.scss",
  providers: [
    provideIcons({
      lucideArrowRight,
      lucideBot,
      lucideCalendar,
      lucideChevronRight,
      lucideFileText,
      lucideFolderOpen,
      lucideGavel,
      lucideInfo,
      lucideMessageCircle,
      lucideSparkles,
      lucideSquareCheck,
      lucideTriangleAlert,
      lucideUpload,
      lucideUsers,
      lucideWallet,
    }),
  ],
})
export class DashboardComponent {
  private readonly localization = inject(LocalizationService);
  private readonly authState = inject(AuthState);
  private readonly chat = inject(ChatApiClient);
  private readonly router = inject(Router);

  protected readonly promptForm = new FormGroup({
    prompt: new FormControl("", { nonNullable: true }),
  });
  protected readonly sendingPrompt = signal(false);
  protected readonly promptError = signal("");

  protected onPromptKeydown(event: Event): void {
    if ((event as KeyboardEvent).shiftKey) return;

    event.preventDefault();
    this.submitPrompt();
  }

  protected submitPrompt(): void {
    const content = this.promptForm.controls.prompt.value.trim();
    const workspaceId = this.authState.session()?.memberships[0]?.workspaceId;
    if (!content || !workspaceId || this.sendingPrompt()) return;

    this.sendingPrompt.set(true);
    this.promptError.set("");
    this.chat.createSession({ workspaceId }).subscribe({
      next: (session) => {
        this.chat.sendMessage(workspaceId, session.id, content).subscribe({
          next: () => {
            this.router.navigateByUrl("/assistant");
          },
          error: () => {
            this.sendingPrompt.set(false);
            this.promptError.set("Unable to send that message.");
          },
        });
      },
      error: () => {
        this.sendingPrompt.set(false);
        this.promptError.set("Unable to create a conversation.");
      },
    });
  }

  translateStatus(status: CaseStatus): string {
    return this.localization.translate(`dashboard.${status.toLowerCase()}`);
  }

  readonly stats = [
    {
      title: "dashboard.statActiveCases",
      value: "24",
      trend: "2",
      trendDetail: "dashboard.thisMonth",
      trendDirection: "up" as const,
      icon: "lucideFolderOpen",
      chart: [25, 40, 35, 55, 48, 68, 58, 75],
    },
    {
      title: "dashboard.statUpcomingHearings",
      value: "5",
      trend: "Next:",
      trendDetail: "dashboard.tomorrow",
      trendDirection: "neutral" as const,
      icon: "lucideCalendar",
      chart: [],
    },
    {
      title: "dashboard.statPendingTasks",
      value: "12",
      trend: "4",
      trendDetail: "dashboard.dueToday",
      trendDirection: "down" as const,
      icon: "lucideSquareCheck",
      chart: [36, 45, 30, 58, 48, 67, 54, 80],
    },
    {
      title: "dashboard.statTotalDocuments",
      value: "156",
      trend: "12",
      trendDetail: "dashboard.thisMonth",
      trendDirection: "up" as const,
      icon: "lucideFileText",
      chart: [20, 30, 28, 48, 42, 62, 52, 78],
    },
  ];

  readonly upcomingEvents: DashboardEvent[] = [
    {
      time: "10:00",
      title: "dashboard.courtHearing",
      detail: "dashboard.eventCaseMarko",
      icon: "lucideGavel",
      tag: "dashboard.today",
    },
    {
      time: "14:30",
      title: "dashboard.clientMeeting",
      detail: "dashboard.eventClientAna",
      icon: "lucideUsers",
      tag: "dashboard.today",
    },
    {
      time: "16:00",
      title: "dashboard.deadlineEvent",
      detail: "dashboard.submitAppeal",
      icon: "lucideFileText",
      tag: "dashboard.today",
    },
    {
      time: "dashboard.sep14",
      title: "dashboard.courtHearing",
      detail: "dashboard.eventCaseMilica",
      icon: "lucideGavel",
      tag: "dashboard.tomorrow",
    },
    {
      time: "dashboard.sep16",
      title: "dashboard.meeting",
      detail: "dashboard.eventContractReview",
      icon: "lucideCalendar",
      tag: "dashboard.inTwoDays",
    },
  ];

  readonly recentActivity: DashboardActivity[] = [
    {
      title: "dashboard.documentUploaded",
      detail: "dashboard.activityContract",
      time: "dashboard.tenMinutesAgo",
      icon: "lucideFileText",
      tone: "blue",
    },
    {
      title: "dashboard.caseUpdated",
      detail: "dashboard.statusChangedActive",
      time: "dashboard.oneHourAgo",
      icon: "lucideFolderOpen",
      tone: "orange",
    },
    {
      title: "dashboard.taskCreated",
      detail: "dashboard.prepareCourtResponse",
      time: "dashboard.twoHoursAgo",
      icon: "lucideSquareCheck",
      tone: "green",
    },
    {
      title: "dashboard.clientAdded",
      detail: "dashboard.activityClientNikola",
      time: "dashboard.threeHoursAgo",
      icon: "lucideUsers",
      tone: "purple",
    },
    {
      title: "dashboard.paymentReceived",
      detail: "dashboard.invoiceReceived",
      time: "dashboard.fiveHoursAgo",
      icon: "lucideWallet",
      tone: "orange",
    },
  ];

  readonly notifications: DashboardNotification[] = [
    {
      title: "dashboard.newDocumentUploaded",
      detail: "dashboard.notificationContract",
      time: "dashboard.tenMinutesShort",
      icon: "lucideFileText",
      tone: "blue",
    },
    {
      title: "dashboard.hearingReminder",
      detail: "dashboard.notificationHearing",
      time: "dashboard.oneHourShort",
      icon: "lucideCalendar",
      tone: "blue",
    },
    {
      title: "dashboard.deadlineApproaching",
      detail: "dashboard.notificationDeadline",
      time: "dashboard.threeHoursShort",
      icon: "lucideTriangleAlert",
      tone: "red",
    },
    {
      title: "dashboard.newClientMessage",
      detail: "dashboard.notificationClientAna",
      time: "dashboard.fiveHoursShort",
      icon: "lucideMessageCircle",
      tone: "blue",
    },
    {
      title: "dashboard.systemUpdate",
      detail: "dashboard.backupCompleted",
      time: "dashboard.oneDayShort",
      icon: "lucideInfo",
      tone: "purple",
    },
  ];

  readonly cases: CaseOverview[] = [
    {
      number: "P-123/2026",
      client: "Marko Petrović",
      type: "dashboard.civil",
      status: "Active",
      statusClass: "active",
      court: "dashboard.basicCourtSubotica",
      deadline: "Sep 14, 2025",
    },
    {
      number: "P-124/2026",
      client: "Ana Jovanović",
      type: "dashboard.criminal",
      status: "Active",
      statusClass: "active",
      court: "dashboard.highCourtBelgrade",
      deadline: "Sep 21, 2025",
    },
    {
      number: "P-125/2026",
      client: "Nikola Ilić",
      type: "dashboard.commercial",
      status: "Pending",
      statusClass: "pending",
      court: "dashboard.commercialCourt",
      deadline: "Sep 28, 2025",
    },
    {
      number: "P-126/2026",
      client: "Jelena Stojanović",
      type: "dashboard.family",
      status: "Closed",
      statusClass: "closed",
      court: "dashboard.basicCourtNoviSad",
      deadline: "Aug 30, 2025",
    },
    {
      number: "P-127/2026",
      client: "Petar Marković",
      type: "dashboard.labor",
      status: "Active",
      statusClass: "active",
      court: "dashboard.highCourtBelgrade",
      deadline: "Oct 05, 2025",
    },
  ];

  readonly quickActions: QuickAction[] = [
    { title: "dashboard.createNewCase", icon: "lucideFolderOpen" },
    { title: "dashboard.uploadDocument", icon: "lucideUpload" },
    { title: "dashboard.addClient", icon: "lucideUsers" },
    { title: "dashboard.createTask", icon: "lucideSquareCheck" },
    { title: "dashboard.scheduleEvent", icon: "lucideCalendar" },
  ];
}
