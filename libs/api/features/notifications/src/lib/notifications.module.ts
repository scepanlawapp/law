import { Module } from "@nestjs/common";
import { NotificationReminderService } from "./notification-reminder.service";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationReminderService],
  exports: [NotificationsService, NotificationReminderService],
})
export class NotificationsModule {}
