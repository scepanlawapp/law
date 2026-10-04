import { Module } from "@nestjs/common";
import { ActivitiesTasksDeadlinesController } from "./activities-tasks-deadlines.controller";
import { ActivitiesTasksDeadlinesService } from "./activities-tasks-deadlines.service";
import { NotificationsModule } from "@law/notifications";
import { WorkEntriesModule } from "@law/work-entries";

@Module({
  imports: [NotificationsModule, WorkEntriesModule],
  controllers: [ActivitiesTasksDeadlinesController],
  providers: [ActivitiesTasksDeadlinesService],
  exports: [ActivitiesTasksDeadlinesService],
})
export class ActivitiesTasksDeadlinesModule {}
