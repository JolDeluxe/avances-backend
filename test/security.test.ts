import { describe, it, expect } from "bun:test";
import { createHmac } from "node:crypto";
import { securityService } from "../src/modules/auth/services/security.service";
import { env } from "../src/config/env";

describe("SecurityService - Hashing y Criptografía", () => {
  it("debe generar hashes de contraseñas con salt únicos para la misma contraseña", () => {
    const password = "PasswordSegura123!";
    const hash1 = securityService.hashPassword(password);
    const hash2 = securityService.hashPassword(password);

    expect(hash1).not.toBe(hash2);
    expect(hash1.includes(":")).toBe(true);
    expect(hash2.includes(":")).toBe(true);

    const [salt1, h1] = hash1.split(":");
    const [salt2, h2] = hash2.split(":");

    expect(salt1).not.toBe(salt2);
    expect(h1).not.toBe(h2);
    expect(salt1!.length).toBe(32); // 16 bytes hex
    expect(h1!.length).toBe(64);    // SHA-256 hex
  });

  it("debe validar correctamente contraseñas coincidentes y rechazar inválidas", () => {
    const password = "MiClaveSecreta_2026";
    const hash = securityService.hashPassword(password);

    expect(securityService.verifyPassword(password, hash)).toBe(true);
    expect(securityService.verifyPassword("ClaveEquivocada", hash)).toBe(false);
    expect(securityService.verifyPassword("", hash)).toBe(false);
    expect(securityService.verifyPassword(password, "malformed_hash")).toBe(false);
  });

  it("debe generar refresh tokens aleatorios de longitud esperada", () => {
    const token1 = securityService.generateRefreshToken();
    const token2 = securityService.generateRefreshToken();

    expect(token1).not.toBe(token2);
    expect(token1.length).toBe(80); // 40 bytes en hex
    expect(token2.length).toBe(80);
  });

  it("debe generar hash unidireccional consistente del refresh token con HMAC-SHA256", () => {
    const token = securityService.generateRefreshToken();
    const hash1 = securityService.hashRefreshToken(token);
    const hash2 = securityService.hashRefreshToken(token);

    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64); // SHA-256 hex

    // Tokens distintos producen hashes distintos
    const otroToken = securityService.generateRefreshToken();
    const hashOtro = securityService.hashRefreshToken(otroToken);
    expect(hash1).not.toBe(hashOtro);

    // El hash no contiene el token en texto plano
    expect(hash1.includes(token)).toBe(false);
  });
});

describe("SecurityService - Access Tokens (JWT HS256 de 15 minutos)", () => {
  const payloadBase = {
    usuarioId: 10,
    usuario: "almacen1",
    rolId: 3,
    departamentoId: 2,
    permisos: ["listado:crear", "listado:ver", "listado:separar"],
  };

  it("debe emitir access tokens con exactamente 15 minutos de expiración", () => {
    const token = securityService.generateAccessToken(payloadBase);
    const parts = token.split(".");
    expect(parts.length).toBe(3);

    const decoded = securityService.verifyAccessToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.usuarioId).toBe(10);
    expect(decoded?.usuario).toBe("almacen1");
    expect(decoded?.rolId).toBe(3);
    expect(decoded?.departamentoId).toBe(2);
    expect(decoded?.permisos).toEqual(["listado:crear", "listado:ver", "listado:separar"]);

    // Validar expiración de 15 minutos (900 segundos)
    expect(decoded!.exp - decoded!.iat).toBe(env.ACCESS_TOKEN_EXPIRES_MINUTES * 60);
  });

  it("debe rechazar tokens con firma alterada o manipulados", () => {
    const token = securityService.generateAccessToken(payloadBase);
    const parts = token.split(".");

    // Alterar payload
    const tamperedPayload = Buffer.from(JSON.stringify({ ...payloadBase, usuarioId: 999 })).toString("base64url");
    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

    expect(securityService.verifyAccessToken(tamperedToken)).toBeNull();

    // Alterar firma
    const tamperedSignature = `${parts[2]!.slice(0, -3)}xyz`;
    const invalidSignatureToken = `${parts[0]}.${parts[1]}.${tamperedSignature}`;
    expect(securityService.verifyAccessToken(invalidSignatureToken)).toBeNull();
  });

  it("debe rechazar tokens expirados", () => {
    // Generar un token con expiración en el pasado
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const pastTime = Math.floor(Date.now() / 1000) - 60; // 1 minuto en el pasado
    const expiredPayload = {
      ...payloadBase,
      iat: pastTime - 900,
      exp: pastTime,
    };
    const payloadEncoded = Buffer.from(JSON.stringify(expiredPayload)).toString("base64url");
    const signature = createHmac("sha256", env.JWT_SECRET)
      .update(`${header}.${payloadEncoded}`)
      .digest("base64url");
    const expiredToken = `${header}.${payloadEncoded}.${signature}`;

    expect(securityService.verifyAccessToken(expiredToken)).toBeNull();
  });

  it("debe rechazar strings malformados", () => {
    expect(securityService.verifyAccessToken("")).toBeNull();
    expect(securityService.verifyAccessToken("abc.def")).toBeNull();
    expect(securityService.verifyAccessToken("a.b.c.d")).toBeNull();
    expect(securityService.verifyAccessToken("not_a_valid_token")).toBeNull();
  });
});

describe("SecurityService - Cifrado Reversible de Contraseñas (AES-256-GCM)", () => {
  const plainText = "MiClaveReversible_2026!#$";

  it("debe cifrar y descifrar correctamente recuperando el texto original", () => {
    const encrypted = securityService.encryptPassword(plainText);
    expect(encrypted).toBeDefined();
    expect(encrypted).not.toBe(plainText);
    expect(encrypted.includes(plainText)).toBe(false);

    // Debe contener las 3 partes: ivHex:authTagHex:encryptedHex
    const parts = encrypted.split(":");
    expect(parts.length).toBe(3);
    const [ivHex, authTagHex, encryptedHex] = parts;
    expect(ivHex!.length).toBe(24);     // 12 bytes = 24 hex
    expect(authTagHex!.length).toBe(32); // 16 bytes = 32 hex
    expect(encryptedHex!.length).toBeGreaterThan(0);

    // Descifrado correcto
    const decrypted = securityService.decryptPassword(encrypted);
    expect(decrypted).toBe(plainText);
  });

  it("debe generar textos cifrados distintos para la misma contraseña gracias al IV aleatorio", () => {
    const enc1 = securityService.encryptPassword(plainText);
    const enc2 = securityService.encryptPassword(plainText);

    expect(enc1).not.toBe(enc2);
    expect(securityService.decryptPassword(enc1)).toBe(plainText);
    expect(securityService.decryptPassword(enc2)).toBe(plainText);
  });

  it("debe rechazar intentos de descifrado con datos manipulados o auth tag inválido", () => {
    const encrypted = securityService.encryptPassword(plainText);
    const parts = encrypted.split(":");

    // Alterar el texto cifrado
    const tamperedPayload = `${parts[0]}:${parts[1]}:${parts[2]!.slice(0, -2)}ff`;
    expect(() => securityService.decryptPassword(tamperedPayload)).toThrow();

    // Alterar el auth tag (falla de integridad GCM)
    const tamperedTag = `${parts[0]}:${parts[1]!.slice(0, -2)}00:${parts[2]}`;
    expect(() => securityService.decryptPassword(tamperedTag)).toThrow();

    // Formato incompleto
    expect(() => securityService.decryptPassword("invalido")).toThrow();
  });
});
