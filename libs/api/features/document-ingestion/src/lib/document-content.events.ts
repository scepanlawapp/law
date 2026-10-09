import { Injectable } from "@nestjs/common";
import type { DocumentContentStatus } from "@prisma/client";
import { Observable, Subject } from "rxjs";

export interface DocumentContentEvent {
  workspaceId: string;
  contentId: string;
  status: DocumentContentStatus;
}

/** In-process stream of content status changes (consumed by SSE bridges). */
@Injectable()
export class DocumentContentEvents {
  private readonly subject = new Subject<DocumentContentEvent>();

  readonly stream$: Observable<DocumentContentEvent> =
    this.subject.asObservable();

  emit(event: DocumentContentEvent): void {
    this.subject.next(event);
  }
}
