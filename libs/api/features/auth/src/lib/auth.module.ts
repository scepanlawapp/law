import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuthMailService } from "./mail.service";
import { AuthGuard } from "./auth.guard";
import { CsrfOriginGuard } from "./csrf.guard";
import { AuthRateLimitGuard } from "./rate-limit.guard";

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthMailService, AuthGuard, CsrfOriginGuard, AuthRateLimitGuard],
  exports: [AuthGuard],
})
export class AuthModule {}
