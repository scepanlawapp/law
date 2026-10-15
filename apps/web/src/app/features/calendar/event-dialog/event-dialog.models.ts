import { Observable } from "rxjs";
import {
  AssistantEventRequest,
  CalendarItem,
  EventDetail,
} from "@law/api-interfaces";
import { EventRequest } from "@law/api-clients";

export interface EventDialogContext {
  date?: string;
  hour?: number;
  item?: CalendarItem;
  event?: EventDetail;
  /** Values for a new event, e.g. proposed by the assistant. */
  initial?: AssistantEventRequest;
  /** Saves the event instead of the events API (e.g. completing an assistant form). */
  save?: (request: EventRequest) => Observable<unknown>;
}
