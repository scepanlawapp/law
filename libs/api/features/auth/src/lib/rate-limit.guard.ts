import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { Request } from "express";

interface AttemptWindow {
  count: number;
  startedAt: number;
}

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  private readonly attempts = new Map<string, AttemptWindow>();
  private readonly limit = 5;
  private readonly windowMs = 60_000;

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const key = `${request.ip}:${request.path}`;
    const now = Date.now();
    const window = this.attempts.get(key);
    if (!window || now - window.startedAt >= this.windowMs) {
      this.attempts.set(key, { count: 1, startedAt: now });
      return true;
    }
    window.count += 1;
    if (window.count > this.limit) {
      throw new HttpException("Too many attempts", HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}