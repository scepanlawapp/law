import { Component } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { RouterLink } from "@angular/router";
import { DashboardStatCardComponent } from "../../shared/components/dashboard-stat-card/dashboard-stat-card.component";
import { TranslatePipe } from "../../core/localization/translate.pipe";

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
  status: "Active" | "Pending" | "Closed";
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
    MatIconModule,
    RouterLink,
    TranslatePipe,
  ],
  templateUrl: "./dashboard.component.html",
  styleUrl: "./dashboard.component.scss",
})
export class DashboardComponent {
  readonly stats = [
    {
      title: "Active cases",
      value: "24",
      trend: "2",
      trendDetail: "this month",
      trendDirection: "up" as const,
      icon: "folder_open",
      chart: [25, 40, 35, 55, 48, 68, 58, 75],
    },
    {
      title: "Upcoming hearings",
      value: "5",
      trend: "Next:",
      trendDetail: "Tomorrow",
      trendDirection: "neutral" as const,
      icon: "calendar_month",
      chart: [],
    },
    {
      title: "Pending tasks",
      value: "12",
      trend: "4",
      trendDetail: "due today",
      trendDirection: "down" as const,
      icon: "check_box",
      chart: [36, 45, 30, 58, 48, 67, 54, 80],
    },
    {
      title: "Total documents",
      value: "156",
      trend: "12",
      trendDetail: "this month",
      trendDirection: "up" as const,
      icon: "description",
      chart: [20, 30, 28, 48, 42, 62, 52, 78],
    },
  ];

  readonly upcomingEvents: DashboardEvent[] = [
    {
      time: "10:00",
      title: "Court hearing",
      detail: "P-123/2026 · Marko Petrović",
      icon: "gavel",
      tag: "Today",
    },
    {
      time: "14:30",
      title: "Client meeting",
      detail: "Ana Jovanović",
      icon: "group",
      tag: "Today",
    },
    {
      time: "16:00",
      title: "Deadline",
      detail: "Submit appeal",
      icon: "description",
      tag: "Today",
    },
    {
      time: "Sep 14",
      title: "Court hearing",
      detail: "P-124/2026 · Milica Jovanović",
      icon: "gavel",
      tag: "Tomorrow",
    },
    {
      time: "Sep 16",
      title: "Meeting",
      detail: "With client · contract review",
      icon: "calendar_month",
      tag: "In 2 days",
    },
  ];

  readonly recentActivity: DashboardActivity[] = [
    {
      title: "Document uploaded",
      detail: "Ugovor.pdf · P-123/2026",
      time: "10 minutes ago",
      icon: "description",
      tone: "blue",
    },
    {
      title: "Case updated",
      detail: "Status changed to Active",
      time: "1 hour ago",
      icon: "folder_open",
      tone: "orange",
    },
    {
      title: "New task created",
      detail: "Prepare response to court",
      time: "2 hours ago",
      icon: "check_box",
      tone: "green",
    },
    {
      title: "Client added",
      detail: "Nikola Petrović",
      time: "3 hours ago",
      icon: "group",
      tone: "purple",
    },
    {
      title: "Payment received",
      detail: "Invoice #INV-0042 · 1.250,00 €",
      time: "5 hours ago",
      icon: "account_balance_wallet",
      tone: "orange",
    },
  ];

  readonly notifications: DashboardNotification[] = [
    {
      title: "New document uploaded",
      detail: "Contract.pdf in case P-123/2026",
      time: "10m",
      icon: "description",
      tone: "blue",
    },
    {
      title: "Hearing reminder",
      detail: "Court hearing tomorrow at 10:00",
      time: "1h",
      icon: "calendar_month",
      tone: "blue",
    },
    {
      title: "Deadline approaching",
      detail: "Submit appeal in 2 days",
      time: "3h",
      icon: "warning",
      tone: "red",
    },
    {
      title: "New message from client",
      detail: "Ana Jovanović",
      time: "5h",
      icon: "chat_bubble_outline",
      tone: "blue",
    },
    {
      title: "System update",
      detail: "Backup completed successfully",
      time: "1d",
      icon: "info",
      tone: "purple",
    },
  ];

  readonly cases: CaseOverview[] = [
    {
      number: "P-123/2026",
      client: "Marko Petrović",
      type: "Civil",
      status: "Active",
      court: "Basic Court Subotica",
      deadline: "Sep 14, 2025",
    },
    {
      number: "P-124/2026",
      client: "Ana Jovanović",
      type: "Criminal",
      status: "Active",
      court: "High Court Belgrade",
      deadline: "Sep 21, 2025",
    },
    {
      number: "P-125/2026",
      client: "Nikola Ilić",
      type: "Commercial",
      status: "Pending",
      court: "Commercial Court",
      deadline: "Sep 28, 2025",
    },
    {
      number: "P-126/2026",
      client: "Jelena Stojanović",
      type: "Family",
      status: "Closed",
      court: "Basic Court Novi Sad",
      deadline: "Aug 30, 2025",
    },
    {
      number: "P-127/2026",
      client: "Petar Marković",
      type: "Labor",
      status: "Active",
      court: "High Court Belgrade",
      deadline: "Oct 05, 2025",
    },
  ];

  readonly quickActions: QuickAction[] = [
    { title: "Create new case", icon: "folder_open" },
    { title: "Upload document", icon: "upload_file" },
    { title: "Add client", icon: "group" },
    { title: "Create task", icon: "check_box" },
    { title: "Schedule event", icon: "calendar_month" },
  ];
}
