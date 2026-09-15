import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { WorkspacesController } from "./workspaces.controller";
import { CoreModule } from "@law/core";
import { AuthModule } from "@law/auth";
import { ChatModule } from "@law/chat";
import { ClientsModule } from "@law/clients";
import { CasesModule } from "@law/cases";
import { MattersModule } from "@law/matters";
import { ReferencesModule } from "@law/references";
import { UserSettingsModule } from "@law/user-settings";
import { validateEnvironment } from "./config.validation";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    CoreModule,
    AuthModule,
    ChatModule,
    ClientsModule,
    CasesModule,
    MattersModule,
    ReferencesModule,
    UserSettingsModule,
  ],
  controllers: [AppController, WorkspacesController],
  providers: [AppService],
})
export class AppModule {}
