export type ClientFormTab =
  | "basic"
  | "addresses"
  | "contacts"
  | "identification"
  | "additional";

export interface ClientFormDialogContext {
  clientId?: string;
  initialTab?: ClientFormTab;
}
