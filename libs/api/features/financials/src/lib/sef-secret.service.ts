import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createDecipheriv, createHash } from "node:crypto";

@Injectable()
export class SefSecretService {
  constructor(private readonly config: ConfigService) {}

  decrypt(settings: {
    sefApiKeyCiphertext: string | null;
    sefApiKeyIv: string | null;
    sefApiKeyAuthTag: string | null;
  }): string {
    const keySource = this.config.get<string>("ORGANIZATION_SECRETS_KEY")?.trim();
    if (!keySource || keySource.length < 32)
      throw new BadRequestException("SEF secret encryption is not configured");
    if (!settings.sefApiKeyCiphertext || !settings.sefApiKeyIv || !settings.sefApiKeyAuthTag)
      throw new BadRequestException("SEF API key is not configured");
    try {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        createHash("sha256").update(keySource).digest(),
        Buffer.from(settings.sefApiKeyIv, "base64"),
      );
      decipher.setAuthTag(Buffer.from(settings.sefApiKeyAuthTag, "base64"));
      return Buffer.concat([
        decipher.update(Buffer.from(settings.sefApiKeyCiphertext, "base64")),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      throw new BadRequestException("SEF API key could not be decrypted");
    }
  }
}
