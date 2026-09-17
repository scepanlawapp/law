import { CalendarItem } from "@law/api-interfaces";

export interface EventDialogContext {
  date?: string;
  hour?: number;
  item?: CalendarItem;
}
