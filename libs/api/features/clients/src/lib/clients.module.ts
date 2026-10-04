import { Module } from "@nestjs/common";
import { WorkEntriesModule } from "@law/work-entries";
import { ClientsController } from "./clients.controller";
import { ClientsService } from "./clients.service";

@Module({
  imports: [WorkEntriesModule],
  controllers: [ClientsController],
  providers: [ClientsService],
  exports: [ClientsService],
})
export class ClientsModule {}
