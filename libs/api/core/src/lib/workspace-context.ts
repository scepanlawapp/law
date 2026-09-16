import { AsyncLocalStorage } from "node:async_hooks";
import { Injectable } from "@nestjs/common";
import { WorkspaceRole } from "@law/api-interfaces";

export interface WorkspaceContext {
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
}

@Injectable()
export class WorkspaceContextService {
  private static readonly storage = new AsyncLocalStorage<WorkspaceContext>();

  static get current(): WorkspaceContext | undefined {
    return this.storage.getStore();
  }

  static get required(): WorkspaceContext {
    const context = this.current;
    if (!context) {
      throw new Error(
        "WorkspaceContext is required but not initialized for the current execution",
      );
    }
    return context;
  }

  static run<R>(context: WorkspaceContext, fn: () => R): R {
    return this.storage.run(context, fn);
  }

  run<R>(context: WorkspaceContext, fn: () => R): R {
    return WorkspaceContextService.storage.run(context, fn);
  }

  enterWith(context: WorkspaceContext): void {
    WorkspaceContextService.storage.enterWith(context);
  }

  get current(): WorkspaceContext | undefined {
    return WorkspaceContextService.current;
  }

  get required(): WorkspaceContext {
    return WorkspaceContextService.required;
  }
}
