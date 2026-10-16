import { Injectable, NotFoundException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "@law/core";
import { TrustedDeviceSummary } from "@law/api-interfaces";
import { TRUSTED_DEVICE_TTL_MS } from "../cookies";

const MAX_USER_AGENT_LENGTH = 512;
const MAX_IP_LENGTH = 64;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * "Remember this device" for the second factor. The raw token only ever
 * lives in the HttpOnly cookie; the database holds its SHA-256 hash.
 */
@Injectable()
export class TrustedDeviceService {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates a device for the user and returns the raw token (cookie value). */
  async create(
    userId: string,
    meta: { userAgent?: string; ipAddress?: string },
  ): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    await this.prisma.trustedDevice.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + TRUSTED_DEVICE_TTL_MS),
        userAgent: meta.userAgent?.slice(0, MAX_USER_AGENT_LENGTH) || null,
        ipAddress: meta.ipAddress?.slice(0, MAX_IP_LENGTH) || null,
      },
    });
    return token;
  }

  /**
   * True when the token belongs to this user and is neither expired nor
   * revoked. One atomic statement that also stamps `lastUsedAt`; the user is
   * part of the query, so another user's device can never match.
   */
  async validFor(
    userId: string,
    rawToken: string | undefined,
  ): Promise<boolean> {
    if (!rawToken) return false;
    const now = new Date();
    const matched = await this.prisma.trustedDevice.updateMany({
      where: {
        userId,
        tokenHash: hashToken(rawToken),
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: { lastUsedAt: now },
    });
    return matched.count > 0;
  }

  /** Pass the transaction client when revoking inside a transaction. */
  async revokeAll(
    userId: string,
    client: Pick<PrismaService, "trustedDevice"> = this.prisma,
  ): Promise<void> {
    await client.trustedDevice.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Revokes one device of this user; 404 when it is not theirs (or gone). */
  async revoke(userId: string, id: string): Promise<void> {
    const revoked = await this.prisma.trustedDevice.updateMany({
      where: { id, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count === 0) {
      throw new NotFoundException("Trusted device not found");
    }
  }

  /** Whether `id` is the device the given cookie token belongs to. */
  async isCurrent(
    userId: string,
    id: string,
    rawToken: string | undefined,
  ): Promise<boolean> {
    if (!rawToken) return false;
    const device = await this.prisma.trustedDevice.findFirst({
      where: { id, userId, tokenHash: hashToken(rawToken) },
      select: { id: true },
    });
    return device !== null;
  }

  async list(
    userId: string,
    currentRawToken?: string,
  ): Promise<TrustedDeviceSummary[]> {
    const devices = await this.prisma.trustedDevice.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    const currentHash = currentRawToken ? hashToken(currentRawToken) : null;
    return devices.map((device) => ({
      id: device.id,
      userAgent: device.userAgent,
      createdAt: device.createdAt.toISOString(),
      lastUsedAt: device.lastUsedAt ? device.lastUsedAt.toISOString() : null,
      expiresAt: device.expiresAt.toISOString(),
      current: currentHash !== null && device.tokenHash === currentHash,
    }));
  }
}
