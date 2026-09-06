import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuthMailService } from "./mail.service";

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthMailService],
})
export class AuthModule {}
