import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Request } from "express";
import { AuthSessionResponse } from "@law/api-interfaces";
import { AuthService } from "./auth.service";
import { SESSION_COOKIE, readCookie } from "./cookies";

export interface AuthenticatedRequest extends Request {
  auth?: AuthSessionResponse;
}

export function sessionToken(request: Request): string | undefined {
  return readCookie(request, SESSION_COOKIE);
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = sessionToken(request);
    if (!token) throw new UnauthorizedException("Authentication required");
    request.auth = await this.authService.currentUser(token);
    return true;
  }
}
