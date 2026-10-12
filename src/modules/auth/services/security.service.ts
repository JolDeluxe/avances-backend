import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";
import { env } from "../../../config/env";

export interface TokenPayload {
  usuarioId: number;
  usuario: string;
  rolId: number;
  departamentoId: number;
  permisos: string[];
  versionPermisos?: number;
}

interface DecodedToken extends TokenPayload {
  iat: number;
  exp: number;
}

export class SecurityService {
  /**
   * Obtiene la clave de 32 bytes (256 bits) para AES-256-GCM a partir de env.PASSWORD_ENCRYPTION_KEY
   */
  private getEncryptionKey(): Buffer {
    return createHash("sha256").update(env.PASSWORD_ENCRYPTION_KEY).digest();
  }

  /**
   * Cifra una contraseña de forma reversible usando AES-256-GCM con IV aleatorio y Authentication Tag.
   * Formato seguro: ivHex:authTagHex:encryptedHex
   */
  encryptPassword(password: string): string {
    const iv = randomBytes(12); // 96 bits estándar NIST para GCM
    const key = this.getEncryptionKey();
    const cipher = createCipheriv("aes-256-gcm", key, iv);

    const encrypted = Buffer.concat([
      cipher.update(password, "utf8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
  }

  /**
   * Descifra una contraseña cifrada con encryptPassword verificando la integridad con el Auth Tag
   */
  decryptPassword(encryptedData: string): string {
    const parts = encryptedData.split(":");
    if (parts.length !== 3) {
      throw new Error("Formato de datos cifrados inválido");
    }

    const [ivHex, authTagHex, encryptedHex] = parts;
    if (!ivHex || !authTagHex || !encryptedHex) {
      throw new Error("Formato de datos cifrados incompleto");
    }

    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const encrypted = Buffer.from(encryptedHex, "hex");
    const key = this.getEncryptionKey();

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  }

  /**
   * Hashea una contraseña usando SHA-256 con salt (compatible con entornos sin dependencias C++)
   */
  hashPassword(password: string): string {
    const salt = randomBytes(16).toString("hex");
    const hash = createHmac("sha256", salt).update(password).digest("hex");
    return `${salt}:${hash}`;
  }

  /**
   * Verifica una contraseña contra su hash guardado
   */
  verifyPassword(password: string, storedHash: string): boolean {
    const parts = storedHash.split(":");
    if (parts.length !== 2) return false;
    const [salt, originalHash] = parts;
    if (!salt || !originalHash) return false;
    const computedHash = createHmac("sha256", salt).update(password).digest("hex");
    return computedHash === originalHash;
  }

  /**
   * Genera un refresh token criptográficamente seguro y no predecible
   */
  generateRefreshToken(): string {
    return randomBytes(40).toString("hex");
  }

  /**
   * Genera el hash unidireccional del refresh token para almacenarlo en MySQL
   */
  hashRefreshToken(token: string): string {
    return createHmac("sha256", env.JWT_SECRET).update(token).digest("hex");
  }

  /**
   * Genera un Access Token firmado (15 minutos)
   */
  generateAccessToken(payload: TokenPayload): string {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const nowInSeconds = Math.floor(Date.now() / 1000);
    const expInSeconds = nowInSeconds + env.ACCESS_TOKEN_EXPIRES_MINUTES * 60;

    const fullPayload: DecodedToken = {
      ...payload,
      iat: nowInSeconds,
      exp: expInSeconds,
    };

    const payloadEncoded = Buffer.from(JSON.stringify(fullPayload)).toString("base64url");
    const signature = createHmac("sha256", env.JWT_SECRET)
      .update(`${header}.${payloadEncoded}`)
      .digest("base64url");

    return `${header}.${payloadEncoded}.${signature}`;
  }

  /**
   * Verifica y decodifica un Access Token
   */
  verifyAccessToken(token: string): DecodedToken | null {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return null;
      const [header, payload, signature] = parts;
      if (!header || !payload || !signature) return null;

      const expectedSignature = createHmac("sha256", env.JWT_SECRET)
        .update(`${header}.${payload}`)
        .digest("base64url");

      if (signature !== expectedSignature) return null;

      const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as DecodedToken;
      const nowInSeconds = Math.floor(Date.now() / 1000);

      if (decoded.exp < nowInSeconds) {
        return null; // Expirado
      }

      return decoded;
    } catch {
      return null;
    }
  }
}

export const securityService = new SecurityService();
