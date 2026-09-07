import { Component } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { MatMenuModule } from "@angular/material/menu";
import { RouterLink } from "@angular/router";

interface HeaderNotification {
  title: string;
  detail: string;
  time: string;
  icon: string;
  tone: "blue" | "orange" | "red" | "purple";
}

@Component({
  selector: "app-header",
  standalone: true,
  templateUrl: "./header.component.html",
  styleUrl: "./header.component.scss",
  imports: [MatIconModule, MatMenuModule, RouterLink],
})
export class HeaderComponent {
  readonly notifications: HeaderNotification[] = [
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
    {
      title: "Payment received",
      detail: "Invoice #INV-0042 was paid",
      time: "1d",
      icon: "payments",
      tone: "orange",
    },
    {
      title: "Case status changed",
      detail: "P-124/2026 is now Active",
      time: "2d",
      icon: "folder_open",
      tone: "orange",
    },
    {
      title: "New client added",
      detail: "Nikola Petrović joined your workspace",
      time: "2d",
      icon: "group",
      tone: "blue",
    },
    {
      title: "Task completed",
      detail: "Prepare response to court",
      time: "3d",
      icon: "check_box",
      tone: "purple",
    },
    {
      title: "Document review finished",
      detail: "Ugovor.pdf is ready for review",
      time: "3d",
      icon: "fact_check",
      tone: "blue",
    },
  ];
}
