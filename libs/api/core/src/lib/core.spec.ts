import { WorkspaceContext, WorkspaceContextService } from "./workspace-context";
import { WorkspaceContextInterceptor } from "./workspace-context.interceptor";
import { WorkspaceRole } from "@law/api-interfaces";
import { ExecutionContext, CallHandler } from "@nestjs/common";
import { of } from "rxjs";

describe("WorkspaceContextService", () => {
  it("stores and retrieves workspace context across async boundaries", async () => {
    const context: WorkspaceContext = {
      userId: "user-1",
      workspaceId: "ws-1",
      role: WorkspaceRole.OWNER,
    };

    const service = new WorkspaceContextService();
    await service.run(context, async () => {
      expect(WorkspaceContextService.current).toEqual(context);
      expect(WorkspaceContextService.required.workspaceId).toBe("ws-1");
      expect(service.current).toEqual(context);
    });

    expect(WorkspaceContextService.current).toBeUndefined();
  });

  it("throws an error when required context is missing", () => {
    expect(() => WorkspaceContextService.required).toThrow(
      "WorkspaceContext is required",
    );
  });
});

describe("WorkspaceContextInterceptor", () => {
  it("binds WorkspaceContext to AsyncLocalStorage during request handling", (done) => {
    const context: WorkspaceContext = {
      userId: "user-1",
      workspaceId: "ws-1",
      role: WorkspaceRole.OWNER,
    };

    const executionContext = {
      switchToHttp: () => ({
        getRequest: () => ({ workspaceContext: context }),
      }),
    } as ExecutionContext;

    const next: CallHandler = {
      handle: () => {
        expect(WorkspaceContextService.current).toEqual(context);
        return of("result");
      },
    };

    const interceptor = new WorkspaceContextInterceptor();
    interceptor.intercept(executionContext, next).subscribe({
      next: (val) => {
        expect(val).toBe("result");
      },
      complete: () => {
        done();
      },
    });
    expect(WorkspaceContextService.current).toBeUndefined();
  });
});
