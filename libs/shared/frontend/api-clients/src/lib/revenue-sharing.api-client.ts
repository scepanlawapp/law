import { inject, Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import {
  RevenueHistoryEntry,
  RevenuePreviewRequest,
  RevenuePreviewResult,
  RevenuePublishRequest,
  RevenueReferences,
  RevenueSettingsResponse,
} from "@law/api-interfaces";
import { getRuntimeConfig } from "./runtime-config";
@Injectable({ providedIn: "root" })
export class RevenueSharingApiClient {
  private readonly http = inject(HttpClient);
  private endpoint(path = "") {
    const c = getRuntimeConfig();
    return `${c.apiUrl}${c.apiPrefix}/revenue-sharing${path}`;
  }
  get() {
    return this.http.get<RevenueSettingsResponse>(this.endpoint(), {
      withCredentials: true,
    });
  }
  publish(body: RevenuePublishRequest) {
    return this.http.put<RevenueSettingsResponse>(this.endpoint(), body, {
      withCredentials: true,
    });
  }
  references() {
    return this.http.get<RevenueReferences>(this.endpoint("/references"), {
      withCredentials: true,
    });
  }
  history() {
    return this.http.get<RevenueHistoryEntry[]>(this.endpoint("/history"), {
      withCredentials: true,
    });
  }
  preview(body: RevenuePreviewRequest) {
    return this.http.post<RevenuePreviewResult>(
      this.endpoint("/preview"),
      body,
      { withCredentials: true },
    );
  }
}
