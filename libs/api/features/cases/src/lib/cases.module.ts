import { Module } from "@nestjs/common";
import { WorkEntriesModule } from "@law/work-entries";
import { CasesController } from "./cases.controller";
import { CasesService } from "./cases.service";

@Module({
  imports: [WorkEntriesModule],
  controllers: [CasesController],
  providers: [CasesService],
  exports: [CasesService],
})
export class CasesModule {}
