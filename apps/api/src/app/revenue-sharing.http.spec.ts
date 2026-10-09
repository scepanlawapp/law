import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { APP_INTERCEPTOR, Reflector } from "@nestjs/core";
import { AuthGuard, CsrfOriginGuard } from "@law/auth";
import {
  HARDCODED_WORKSPACE_ID,
  PlatformPrismaService,
  WorkspaceAccessGuard,
  WorkspaceContextInterceptor,
  WorkspaceContextService,
} from "@law/core";
import {
  RevenueSharingController,
  RevenueSharingService,
} from "@law/revenue-sharing";
import {
  RevenueConfiguration,
  defaultRevenueConfiguration,
} from "@law/api-interfaces";

/** HTTP integration with real Nest controller, role guard, context and validation.
 * Prisma is replaced at the storage boundary; live database verification is separate. */
describe("Revenue sharing HTTP boundary", () => {
  let app: INestApplication;
  let url: string;
  let membership = {
    workspaceId: HARDCODED_WORKSPACE_ID,
    role: "OWNER",
    status: "ACTIVE",
  };
  let versions: {
    workspaceId: string;
    version: number;
    effectiveFrom: Date;
    configuration: RevenueConfiguration;
  }[];
  let currentVersion: number;
  const memberId = "11111111-1111-4111-8111-111111111111";
  beforeAll(async () => {
    const storage = {
      workspaceMember: {
        findUnique: jest.fn(async () => membership),
        findMany: jest.fn(async () => [{ userId: memberId }]),
      },
      revenueSharingVersion: {
        findFirst: jest.fn(async () => versions[versions.length - 1] ?? null),
        create: jest.fn(async ({ data }) => {
          versions.push(data);
          return data;
        }),
      },
      revenueSharingSettings: {
        upsert: jest.fn(),
        updateMany: jest.fn(async ({ where }) => {
          if (where.currentVersion !== currentVersion) return { count: 0 };
          currentVersion++;
          return { count: 1 };
        }),
      },
      revenueSharingAgreement: { findMany: jest.fn(async () => []) },
    };
    const db = {
      ...storage,
      $transaction: async (callback: (tx: typeof storage) => unknown) =>
        callback(storage),
    };
    const module = await Test.createTestingModule({
      controllers: [RevenueSharingController],
      providers: [
        RevenueSharingService,
        WorkspaceAccessGuard,
        WorkspaceContextService,
        Reflector,
        { provide: PlatformPrismaService, useValue: db },
        { provide: APP_INTERCEPTOR, useClass: WorkspaceContextInterceptor },
      ],
    })
      .overrideGuard(CsrfOriginGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const request = context
            .switchToHttp()
            .getRequest<{
              headers: { cookie?: string };
              auth?: { user: { id: string } };
            }>();
          if (request.headers.cookie !== "law_session=test")
            throw new UnauthorizedException();
          request.auth = { user: { id: memberId } };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api");
    await app.listen(0, "127.0.0.1");
    url = await app.getUrl();
  });
  beforeEach(() => {
    versions = [];
    currentVersion = 0;
    membership = {
      workspaceId: HARDCODED_WORKSPACE_ID,
      role: "OWNER",
      status: "ACTIVE",
    };
  });
  afterAll(async () => {
    await app.close();
  });
  const request = (method = "GET", body?: unknown, authenticated = true) =>
    fetch(`${url}/api/revenue-sharing`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(authenticated ? { cookie: "law_session=test" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const publish = (
    configuration = defaultRevenueConfiguration(),
    expectedVersion = 0,
  ) => ({
    expectedVersion,
    effectiveFrom: "2099-01-01",
    reason: "",
    configuration,
  });
  it("returns disabled defaults and rejects unauthenticated callers", async () => {
    expect((await request()).status).toBe(200);
    expect((await (await request()).json()).configuration.enabled).toBe(false);
    expect((await request("GET", undefined, false)).status).toBe(401);
  });
  it("denies confidential reads and writes for ordinary or suspended members", async () => {
    membership.role = "LAWYER";
    expect((await request()).status).toBe(403);
    expect((await request("PUT", publish())).status).toBe(403);
    membership.role = "OWNER";
    membership.status = "SUSPENDED";
    expect((await request()).status).toBe(404);
  });
  it("round-trips the published revision and preserves disabled rules", async () => {
    const c = defaultRevenueConfiguration();
    c.rates.OWN_CLIENT = { state: "PERCENTAGE", percentage: "37.25" };
    expect((await request("PUT", publish(c))).status).toBe(200);
    const saved = await (await request()).json();
    expect(saved.version).toBe(1);
    expect(saved.configuration.enabled).toBe(false);
    expect(saved.configuration.rates.OWN_CLIENT.percentage).toBe("37.25");
    expect(versions[0].workspaceId).toBe(HARDCODED_WORKSPACE_ID);
  });
  it("returns stable validation errors and never trusts frontend workspace ids", async () => {
    const c = defaultRevenueConfiguration();
    c.rates.OWN_CLIENT = { state: "PERCENTAGE", percentage: "101" };
    const response = await request("PUT", publish(c));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("revenue.INVALID_INPUT");
    const forged = await request("PUT", {
      ...publish(),
      workspaceId: "foreign",
    });
    expect(forged.status).toBe(400);
    expect(versions).toHaveLength(0);
  });
  it("rejects stale revisions through the actual HTTP endpoint", async () => {
    await request("PUT", publish());
    const response = await request("PUT", publish());
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("revenue.VERSION_CONFLICT");
    expect(versions).toHaveLength(1);
  });
});
