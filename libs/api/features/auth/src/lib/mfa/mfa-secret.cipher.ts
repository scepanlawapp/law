import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
}

const MIN_KEY_LENGTH = 32;

@Injectable()
export class MfaSecretCipher implements OnModuleInit {
  private readonly logger = new Logger(MfaSecretCipher.name);
  private readonly keySource = (
    process.env.AUTH_MFA_ENCRYPTION_KEY ?? ""
  ).trim();
  private readonly production = process.env.NODE_ENV === "production";

  get available(): boolean {
    return this.keySource.length >= MIN_KEY_LENGTH;
  }

  onModuleInit(): void {
    if (!this.available && !this.production) {
      this.logger.warn(
        "AUTH_MFA_ENCRYPTION_KEY is missing or shorter than 32 characters; two-factor authentication endpoints will return 503.",
      );
    }
  }

  encrypt(plain: string): EncryptedSecret {
    const key = this.key();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plain, "utf8"),
      cipher.final(),
    ]);
    return {
      ciphertext: ciphertext.toString("base64"),
      iv: iv.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
    };
  }

  decrypt(secret: EncryptedSecret): string {
    const key = this.key();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(secret.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(secret.authTag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(secret.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  }

  private key(): Buffer {
    if (!this.available) {
      throw new ServiceUnavailableException(
        "Two-factor authentication is not configured",
      );
    }
    return createHash("sha256").update(this.keySource).digest();
  }
}
