import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard, CsrfOriginGuard } from "@law/auth";
import { WorkspaceAccess, WorkspaceAccessGuard } from "@law/core";
import { NotificationListQueryDto } from "./notifications.dto";
import { NotificationsService } from "./notifications.service";

@Controller("notifications")
@UseGuards(CsrfOriginGuard, AuthGuard, WorkspaceAccessGuard)
@WorkspaceAccess()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@Query() query: NotificationListQueryDto) {
    return this.notifications.list(query.page, query.pageSize);
  }

  @Get("unread-count")
  unreadCount() {
    return this.notifications.unreadCount();
  }

  @Patch("read-all")
  markAllRead() {
    return this.notifications.markAllRead();
  }

  @Patch(":id/read")
  markRead(@Param("id") id: string) {
    return this.notifications.markRead(id);
  }
}
