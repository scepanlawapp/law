import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";

/**
 * Single BullMQ root connection (Redis) shared by every queue registered via
 * `BullModule.registerQueue`. `BullModule.forRootAsync` is global, and a
 * static module is instantiated once, so importing this from several feature
 * modules never opens a second root connection.
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: () => {
        const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
            password: url.password || undefined,
            // BullMQ requires this; also avoids eager connection attempts at boot.
            maxRetriesPerRequest: null,
            lazyConnect: true,
          },
        };
      },
    }),
  ],
})
export class QueueRootModule {}
