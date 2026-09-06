import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { CoreModule } from "@law/core";
import { AuthModule } from "@law/auth";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), CoreModule, AuthModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
