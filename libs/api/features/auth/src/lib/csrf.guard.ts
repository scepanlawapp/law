import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Request } from "express";
import { AuthRuntimeConfig } from "./auth.config";

@Injectable()
export class CsrfOriginGuard implements CanActivate {
  constructor(private readonly config: AuthRuntimeConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;

    const origin = request.headers.origin;
    const expected = this.config.frontendOrigin;
    if (!origin || !expected || origin === expected) return true;
    throw new ForbiddenException("Invalid request origin");
  }
}
