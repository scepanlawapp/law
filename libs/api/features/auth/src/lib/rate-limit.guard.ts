import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Request } from "express";
import { AuthRateLimitStore } from "./rate-limit.store";

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  private readonly limit = 5;
  private readonly windowMs = 60_000;

  constructor(private readonly store: AuthRateLimitStore) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    // Express routes are case-insensitive and ignore trailing slashes, so
    // normalise the path to keep one bucket per route.
    const path = request.path.toLowerCase().replace(/\/+$/, "") || "/";
    const key = `ip:${request.ip}:${path}`;
    let count: number;
    try {
      count = await this.store.hit(key, this.windowMs);
    } catch {
      throw new ServiceUnavailableException("Rate limiting unavailable");
    }
    if (count > this.limit) {
      throw new HttpException(
        "Too many attempts",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
