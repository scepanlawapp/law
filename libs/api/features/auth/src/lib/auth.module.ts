import { Global, Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { QueueRootModule } from "@law/core";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AUTH_MAIL_QUEUE } from "./mail/auth-mail.queue";
import { AuthMailProcessor } from "./mail/auth-mail.processor";
import { AuthMailService } from "./mail/auth-mail.service";
import { authMailTransportProvider } from "./mail/auth-mail.transport";
import { AuthGuard } from "./auth.guard";
import { CsrfOriginGuard } from "./csrf.guard";
import { AuthRateLimitGuard } from "./rate-limit.guard";
import { AuthRuntimeConfig } from "./auth.config";
import { MfaSecretCipher } from "./mfa/mfa-secret.cipher";
import { AuthSessionIssuer } from "./auth-session.issuer";
import { MfaChallengeService } from "./mfa/mfa-challenge.service";
import { MfaVerificationService } from "./mfa/mfa-verification.service";
import { MfaFailureThrottle } from "./mfa/mfa-failure-throttle";
import { MfaEnrollmentService } from "./mfa/mfa-enrollment.service";
import { MfaController } from "./mfa/mfa.controller";
import { TrustedDeviceService } from "./mfa/trusted-device.service";
import { MfaAdminService } from "./mfa/mfa-admin.service";
import { MfaAdminController } from "./mfa/mfa-admin.controller";
import {
  AUTH_REDIS,
  AuthRateLimitStore,
  RedisAuthRateLimitStore,
  createAuthRedisClient,
} from "./rate-limit.store";

@Global()
@Module({
  imports: [
    QueueRootModule,
    BullModule.registerQueue({ name: AUTH_MAIL_QUEUE }),
  ],
  controllers: [AuthController, MfaController, MfaAdminController],
  providers: [
    AuthService,
    AuthMailService,
    AuthMailProcessor,
    authMailTransportProvider,
    AuthGuard,
    CsrfOriginGuard,
    AuthRateLimitGuard,
    AuthRuntimeConfig,
    MfaSecretCipher,
    AuthSessionIssuer,
    MfaChallengeService,
    MfaVerificationService,
    MfaFailureThrottle,
    MfaEnrollmentService,
    TrustedDeviceService,
    MfaAdminService,
    { provide: AUTH_REDIS, useFactory: createAuthRedisClient },
    { provide: AuthRateLimitStore, useClass: RedisAuthRateLimitStore },
  ],
  exports: [
    AuthService,
    AuthMailService,
    AuthGuard,
    CsrfOriginGuard,
    AuthRuntimeConfig,
    MfaSecretCipher,
  ],
})
export class AuthModule {}
