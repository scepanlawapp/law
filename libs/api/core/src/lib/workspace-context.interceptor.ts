import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { WorkspaceContextService } from "./workspace-context";

@Injectable()
export class WorkspaceContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const workspaceContext = request?.workspaceContext;
    if (workspaceContext) {
      return new Observable((subscriber) => {
        WorkspaceContextService.run(workspaceContext, () => {
          const subscription = next.handle().subscribe(subscriber);
          return () => subscription.unsubscribe();
        });
      });
    }
    return next.handle();
  }
}
