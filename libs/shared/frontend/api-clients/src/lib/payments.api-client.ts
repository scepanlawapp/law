import { inject, Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import {
  CollectionTotals,
  InvoiceCollection,
  InvoicePaymentHistory,
  PaymentDetail,
  PaymentOptions,
  PaymentPage,
  PaymentQuery,
  SavePaymentRequest,
} from "@law/api-interfaces";
import { getRuntimeConfig } from "./runtime-config";
@Injectable({ providedIn: "root" })
export class PaymentsApiClient {
  private readonly http = inject(HttpClient);
  private url(path = "") {
    const c = getRuntimeConfig();
    return `${c.apiUrl}${c.apiPrefix}/financials/payments${path}`;
  }
  private params(q: object) {
    return Object.fromEntries(
      Object.entries(q)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => [k, String(v)]),
    );
  }
  list(q: PaymentQuery) {
    return this.http.get<PaymentPage>(this.url(), {
      withCredentials: true,
      params: this.params(q),
    });
  }
  summary(q: PaymentQuery) {
    return this.http.get<CollectionTotals[]>(this.url("/summary"), {
      withCredentials: true,
      params: this.params(q),
    });
  }
  options() {
    return this.http.get<PaymentOptions>(this.url("/options"), {
      withCredentials: true,
    });
  }
  detail(id: string) {
    return this.http.get<PaymentDetail>(this.url("/" + id), {
      withCredentials: true,
    });
  }
  collections(clientId?: string) {
    return this.http.get<InvoiceCollection[]>(this.url("/collections"), {
      withCredentials: true,
      params: this.params({ clientId }),
    });
  }
  collection(id: string) {
    return this.http.get<InvoiceCollection>(
      this.url("/invoice/" + id + "/collection"),
      { withCredentials: true },
    );
  }
  history(id: string) {
    return this.http.get<InvoicePaymentHistory[]>(
      this.url("/invoice/" + id + "/history"),
      { withCredentials: true },
    );
  }
  eligible(clientId: string, currency: string, paymentId?: string) {
    return this.http.get<InvoiceCollection[]>(this.url("/eligible-invoices"), {
      withCredentials: true,
      params: this.params({ clientId, currency, paymentId }),
    });
  }
  save(id: string | null, body: SavePaymentRequest, key: string) {
    const options = {
      withCredentials: true,
      headers: { "Idempotency-Key": key },
    };
    return id
      ? this.http.patch<PaymentDetail>(this.url("/" + id), body, options)
      : this.http.post<PaymentDetail>(this.url(), body, options);
  }
  void(id: string, reason: string, version: number, key: string) {
    return this.http.post<PaymentDetail>(
      this.url("/" + id + "/void"),
      { reason, version },
      { withCredentials: true, headers: { "Idempotency-Key": key } },
    );
  }
}
