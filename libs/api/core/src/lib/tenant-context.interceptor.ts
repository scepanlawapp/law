import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { TenantContextService } from "./tenant-context";

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const tenantContext = request?.tenantContext;
    if (tenantContext) {
      return new Observable((subscriber) => {
        TenantContextService.run(tenantContext, () => {
          const subscription = next.handle().subscribe(subscriber);
          return () => subscription.unsubscribe();
        });
      });
    }
    return next.handle();
  }
}
