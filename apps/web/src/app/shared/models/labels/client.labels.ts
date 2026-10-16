import {
  ClientAddressType,
  ClientStatus,
  ClientType,
} from "@law/api-interfaces";
import { LabelMap } from "../select-option";

export const CLIENT_TYPE_LABELS: LabelMap<ClientType> = {
  [ClientType.INDIVIDUAL]: "clients.type.INDIVIDUAL",
  [ClientType.ORGANIZATION]: "clients.type.ORGANIZATION",
};

export const CLIENT_STATUS_LABELS: LabelMap<ClientStatus> = {
  [ClientStatus.PROSPECT]: "clients.status.PROSPECT",
  [ClientStatus.ACTIVE]: "clients.status.ACTIVE",
  [ClientStatus.INACTIVE]: "clients.status.INACTIVE",
  [ClientStatus.ARCHIVED]: "clients.status.ARCHIVED",
};

export const CLIENT_ADDRESS_TYPE_LABELS: LabelMap<ClientAddressType> = {
  [ClientAddressType.HEADQUARTERS]: "clients.addressType.HEADQUARTERS",
  [ClientAddressType.HOME]: "clients.addressType.HOME",
  [ClientAddressType.REGISTERED]: "clients.addressType.REGISTERED",
  [ClientAddressType.DELIVERY]: "clients.addressType.DELIVERY",
  [ClientAddressType.BILLING]: "clients.addressType.BILLING",
  [ClientAddressType.OFFICE]: "clients.addressType.OFFICE",
  [ClientAddressType.POSTAL]: "clients.addressType.POSTAL",
};
