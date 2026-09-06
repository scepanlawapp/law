import { Injectable } from "@nestjs/common";
import { Observable, Subject, filter, map } from "rxjs";
import { ChatStreamEvent } from "@law/api-interfaces";

@Injectable()
export class ChatEventBus {
  private readonly events = new Subject<ChatStreamEvent>();

  emit(event: ChatStreamEvent): void {
    this.events.next(event);
  }

  stream(sessionId: string): Observable<ChatStreamEvent> {
    return this.events.pipe(
      filter((event) => event.sessionId === sessionId),
      map((event) => event),
    );
  }
}
