import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Request } from "express";

@Injectable()
export class CsrfOriginGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;

    const origin = request.headers.origin;
    const expected = process.env.AUTH_FRONTEND_ORIGIN;
    if (!origin || !expected || origin === expected) return true;
    throw new ForbiddenException("Invalid request origin");
  }
}