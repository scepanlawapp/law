import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { CoreModule } from "@law/core";
import { AuthModule } from "@law/auth";
import { ChatModule } from "@law/chat";
import { ClientsModule } from "@law/clients";
import { CasesModule } from "@law/cases";
import { ReferencesModule } from "@law/references";
import { UserSettingsModule } from "@law/user-settings";
import { ActivitiesTasksDeadlinesModule } from "@law/activities-tasks-deadlines";
import { LegalKnowledgeModule } from "@law/legal-knowledge";
import { validateEnvironment } from "./config.validation";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    CoreModule,
    AuthModule,
    ChatModule,
    ClientsModule,
    CasesModule,
    ReferencesModule,
    UserSettingsModule,
    ActivitiesTasksDeadlinesModule,
    LegalKnowledgeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
