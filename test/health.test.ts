import { describe, it, expect } from "bun:test";
import { createApp } from "../src/app";
import type { ApiResponse } from "../src/utils/response";

describe("Health Check Endpoint", () => {
  const app = createApp();

  it("debe responder 200 y status ok en GET /health", async () => {
    const server = app.listen(0);
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 3000;

    try {
      const res = await fetch(`http://localhost:${port}/health`);
      expect(res.status).toBe(200);

      const body = (await res.json()) as ApiResponse<{ status: string; environment: string }>;
      expect(body.success).toBe(true);
      expect(body.data?.status).toBe("ok");
      expect(body.data?.environment).toBeDefined();
    } finally {
      server.close();
    }
  });

  it("debe responder 404 en rutas desconocidas", async () => {
    const server = app.listen(0);
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 3000;

    try {
      const res = await fetch(`http://localhost:${port}/ruta-inexistente`);
      expect(res.status).toBe(404);

      const body = (await res.json()) as ApiResponse;
      expect(body.success).toBe(false);
      expect(body.message).toBe("Ruta no encontrada");
    } finally {
      server.close();
    }
  });
});
