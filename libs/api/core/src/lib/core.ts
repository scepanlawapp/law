import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient as PlatformPrismaClient } from "@prisma/platform-client";

@Injectable()
export class PlatformPrismaService
  extends PlatformPrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

// Backwards-compatibility alias for platform services
export { PlatformPrismaService as PrismaService };
