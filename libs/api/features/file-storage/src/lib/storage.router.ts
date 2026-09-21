import { Injectable, Logger } from "@nestjs/common";
import { PlatformPrismaService } from "@law/core";
import { LocalStorageAdapter } from "./local-storage.adapter";
import { StorageError } from "./storage.errors";
import { PersistedStorageConnection, StorageAdapter } from "./storage.types";

@Injectable()
export class StorageRouter {
  private readonly logger = new Logger(StorageRouter.name);

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly local: LocalStorageAdapter,
  ) {}

  adapterFor(connection: PersistedStorageConnection): StorageAdapter {
    if (!connection.enabled) {
      throw new StorageError("Storage connection is disabled", "DISABLED_CONNECTION");
    }
    if (connection.providerType !== "LOCAL") {
      throw new StorageError(
        "Unsupported storage provider",
        "UNSUPPORTED_CONNECTION",
      );
    }
    return this.local;
  }

  async defaultConnection(
    workspaceId: string,
  ): Promise<PersistedStorageConnection> {
    const connection = await this.prisma.storageConnection.findFirst({
      where: { workspaceId, isDefault: true, enabled: true },
    });
    if (!connection) {
      throw new StorageError(
        "No enabled default storage connection",
        "NO_DEFAULT_CONNECTION",
      );
    }
    if (connection.providerType !== "LOCAL") {
      this.logger.error(
        `Default connection ${connection.id} uses unsupported provider ${connection.providerType}`,
      );
      throw new StorageError(
        "Unsupported storage provider",
        "UNSUPPORTED_CONNECTION",
      );
    }
    return connection as PersistedStorageConnection;
  }

  async connectionById(
    workspaceId: string,
    connectionId: string,
  ): Promise<PersistedStorageConnection> {
    const connection = await this.prisma.storageConnection.findFirst({
      where: { id: connectionId, workspaceId },
    });
    if (!connection) {
      throw new StorageError(
        "Storage connection is unavailable",
        "UNSUPPORTED_CONNECTION",
      );
    }
    return connection as PersistedStorageConnection;
  }
}
