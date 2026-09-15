import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { WorkspacesController } from "./workspaces.controller";
import { CoreModule } from "@law/core";
import { AuthModule } from "@law/auth";
import { ChatModule } from "@law/chat";
import { ReferencesModule } from "@law/references";
import { UserSettingsModule } from "@law/user-settings";
import { ClientsModule } from "@law/clients";
import { MattersModule } from "@law/cases";
import { DocumentsModule } from "@law/documents";
import { validateEnvironment } from "./config.validation";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    CoreModule,
    AuthModule,
    ChatModule,
    ReferencesModule,
    UserSettingsModule,
    ClientsModule,
    MattersModule,
    DocumentsModule,
  ],
  controllers: [AppController, WorkspacesController],
  providers: [AppService],
})
export class AppModule {}
