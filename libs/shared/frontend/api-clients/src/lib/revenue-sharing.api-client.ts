import { inject, Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import {
  RevenueHistoryEntry,
  RevenueVersionListQuery,
  RevenueVersionListResponse,
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
  listVersions(query: RevenueVersionListQuery = {}) {
    return this.http.get<RevenueVersionListResponse>(
      this.endpoint("/versions"),
      {
        withCredentials: true,
        params: { page: query.page ?? 1, pageSize: query.pageSize ?? 20 },
      },
    );
  }
  getVersion(id: string) {
    return this.http.get<RevenueHistoryEntry>(
      this.endpoint(`/versions/${encodeURIComponent(id)}`),
      {
        withCredentials: true,
      },
    );
  }
  preview(body: RevenuePreviewRequest) {
    return this.http.post<RevenuePreviewResult>(
      this.endpoint("/preview"),
      body,
      { withCredentials: true },
    );
  }
}
