import { TestBed } from "@angular/core/testing";
import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import {
  BillingReportsApiClient,
  BillingSetupApiClient,
  WorkEntriesApiClient,
} from "./api-clients";
import { chatEventsUrl, workspaceChatEventsUrl } from "./chat-events-url";

describe("chatEventsUrl", () => {
  it("builds an SSE URL with workspace id", () => {
    expect(
      chatEventsUrl(
        "http://localhost:3001",
        "/api",
        "workspace-1",
        "session-1",
        "2026-09-06T00:00:00.000Z",
      ),
    ).toBe(
      "http://localhost:3001/api/chat/sessions/session-1/events?workspaceId=workspace-1&after=2026-09-06T00%3A00%3A00.000Z",
    );
  });

  it("builds a workspace-wide SSE URL", () => {
    expect(
      workspaceChatEventsUrl("http://localhost:3001", "/api", "workspace-1"),
    ).toBe("http://localhost:3001/api/chat/events?workspaceId=workspace-1");
  });
});

describe("work entry and billing clients", () => {
  let http: HttpTestingController;
  const api = "http://localhost:3001/api";

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it("posts a source confirmation to /work-entries/from-source", () => {
    const body = {
      sourceType: "EVENT" as const,
      sourceId: "event-1",
      minutes: 30,
    };
    TestBed.inject(WorkEntriesApiClient).confirmFromSource(body).subscribe();
    const req = http.expectOne(`${api}/work-entries/from-source`);
    expect(req.request.method).toBe("POST");
    expect(req.request.body).toEqual(body);
    expect(req.request.withCredentials).toBe(true);
    req.flush({});
  });

  it("lists entries with repeated array params", () => {
    TestBed.inject(WorkEntriesApiClient)
      .list({
        page: 1,
        pageSize: 20,
        statuses: ["PROPOSED", "CONFIRMED"],
        unbilledOnly: true,
      })
      .subscribe();
    const req = http.expectOne((r) => r.url === `${api}/work-entries`);
    expect(req.request.params.getAll("statuses")).toEqual([
      "PROPOSED",
      "CONFIRMED",
    ]);
    expect(req.request.params.get("unbilledOnly")).toBe("true");
    req.flush({ items: [], meta: {} });
  });

  it("uses the timer, review, confirm and write-off routes", () => {
    const client = TestBed.inject(WorkEntriesApiClient);
    client.runningTimer().subscribe();
    http.expectOne(`${api}/work-entries/timer`).flush(null);
    client.startTimer({ clientId: "c1" }).subscribe();
    http.expectOne(`${api}/work-entries/timer/start`).flush({});
    client.stopTimer().subscribe();
    expect(
      http.expectOne(`${api}/work-entries/timer/stop`).request.method,
    ).toBe("POST");
    client.review("2026-10-01").subscribe();
    http.expectOne(`${api}/work-entries/review?date=2026-10-01`).flush({
      entries: [],
      proposed: [],
      missingEvents: [],
      untouchedClients: [],
    });
    client.confirm("e1", { minutes: 15 }).subscribe();
    http.expectOne(`${api}/work-entries/e1/confirm`).flush({});
    client.writeOff("e1", { reason: "Gratis" }).subscribe();
    http.expectOne(`${api}/work-entries/e1/write-off`).flush({});
    client.remove("e1").subscribe();
    expect(http.expectOne(`${api}/work-entries/e1`).request.method).toBe(
      "DELETE",
    );
  });

  it("calls the billing setup routes", () => {
    const client = TestBed.inject(BillingSetupApiClient);
    client.listRates({ userId: "u1" }).subscribe();
    http.expectOne(`${api}/billing-setup/rates?userId=u1`).flush([]);
    client
      .upsertProfile("c1", { hourlyRate: "100.00", currency: "EUR" })
      .subscribe();
    expect(
      http.expectOne(`${api}/billing-setup/clients/c1/profile`).request.method,
    ).toBe("PUT");
    client.deactivateRetainer("r1").subscribe();
    http.expectOne(`${api}/billing-setup/retainers/r1/deactivate`).flush({});
  });

  it("requests profitability with a date range", () => {
    TestBed.inject(BillingReportsApiClient)
      .profitability("2026-09-01", "2026-09-30")
      .subscribe();
    const req = http.expectOne(
      `${api}/billing/profitability?from=2026-09-01&to=2026-09-30`,
    );
    expect(req.request.method).toBe("GET");
    req.flush({});
  });

  it("calls the usage and month-end routes", () => {
    const client = TestBed.inject(BillingReportsApiClient);
    client.usage("2026-09").subscribe();
    http.expectOne(`${api}/billing/retainers/usage?month=2026-09`).flush([]);
    client.clientUsage("c1", "2026-09").subscribe();
    http.expectOne(`${api}/billing/clients/c1/usage?month=2026-09`).flush(null);
    client.precheck("2026-09").subscribe();
    http.expectOne(`${api}/billing/month-end/2026-09/precheck`).flush({});
    client.runMonthEnd("2026-09").subscribe();
    expect(
      http.expectOne(`${api}/billing/month-end/2026-09/run`).request.method,
    ).toBe("POST");
  });
});
