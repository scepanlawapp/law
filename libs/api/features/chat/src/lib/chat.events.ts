import { Injectable } from "@nestjs/common";
import { Observable, Subject, filter, map } from "rxjs";
import { ChatStreamEvent } from "@law/api-interfaces";

@Injectable()
export class ChatEventBus {
  private readonly events = new Subject<ChatStreamEvent>();

  emit(event: ChatStreamEvent): void {
    this.events.next({
      ...event,
      workspaceId:
        event.workspaceId ?? event.job?.workspaceId ?? event.draft?.workspaceId,
    });
  }

  stream(sessionId: string): Observable<ChatStreamEvent> {
    return this.events.pipe(
      filter((event) => event.sessionId === sessionId),
      map((event) => event),
    );
  }

  streamWorkspace(workspaceId: string): Observable<ChatStreamEvent> {
    return this.events.pipe(
      filter((event) => event.workspaceId === workspaceId),
      map((event) => event),
    );
  }
}
