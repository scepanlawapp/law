import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./core";

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class CoreModule {}
