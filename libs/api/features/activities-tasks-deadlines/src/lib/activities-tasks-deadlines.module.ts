import { Module } from "@nestjs/common";
import { ActivitiesTasksDeadlinesController } from "./activities-tasks-deadlines.controller";
import { ActivitiesTasksDeadlinesService } from "./activities-tasks-deadlines.service";

@Module({
  controllers: [ActivitiesTasksDeadlinesController],
  providers: [ActivitiesTasksDeadlinesService],
  exports: [ActivitiesTasksDeadlinesService],
})
export class ActivitiesTasksDeadlinesModule {}
