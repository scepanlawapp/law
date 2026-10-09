import {
  EventDetail,
  PastWorkEvent,
  WorkEntryTreatment,
} from "@law/api-interfaces";
import { QuickCaptureInput } from "./quick-capture.models";

export function eventCaptureInput(
  event: Pick<
    EventDetail | PastWorkEvent,
    | "id"
    | "clients"
    | "case"
    | "title"
    | "description"
    | "startsAt"
    | "endsAt"
    | "isAllDay"
  > & {
    userId?: string;
    assigneeUsers?: EventDetail["assigneeUsers"];
    organizerUser?: EventDetail["organizerUser"];
  },
  treatment?: WorkEntryTreatment,
): QuickCaptureInput {
  const minutes = Math.round(
    (new Date(event.endsAt).getTime() - new Date(event.startsAt).getTime()) /
      60000,
  );
  return {
    mode: "create",
    eventId: event.id,
    userId:
      event.userId ?? event.assigneeUsers?.[0]?.id ?? event.organizerUser?.id,
    clientId: event.clients.length === 1 ? event.clients[0].id : undefined,
    caseId: event.case?.id,
    title: event.title.slice(0, 200),
    description: event.description ?? undefined,
    workDate: new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Belgrade",
    }).format(new Date(event.startsAt)),
    minutes:
      !event.isAllDay && minutes >= 1 && minutes <= 1440 ? minutes : undefined,
    ...(treatment ? { treatment } : {}),
  };
}
