import { Module } from "@nestjs/common";
import { ReferencesController } from "./references.controller";
import { ReferencesService } from "./references.service";
import { LegalLookupsController } from "./legal-lookups.controller";
import { LegalLookupsService } from "./legal-lookups.service";

@Module({
  controllers: [ReferencesController, LegalLookupsController],
  providers: [ReferencesService, LegalLookupsService],
  exports: [LegalLookupsService],
})
export class ReferencesModule {}
