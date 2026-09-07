import { Component, DestroyRef, inject, OnInit, signal } from "@angular/core";
import { ChatApiClient } from "@law/api-clients";
import {
  ChatMessageResponse,
  ChatSessionSummary,
  ChatStreamEvent,
} from "@law/api-interfaces";
import { AuthState } from "@law/security";

@Component({
  selector: "app-assistant",
  standalone: true,
  templateUrl: "./assistant.component.html",
  styleUrl: "./assistant.component.scss",
})
export class AssistantComponent {
}
