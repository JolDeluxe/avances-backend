import { describe, it, expect, beforeEach } from "bun:test";
import { InMemoryEventPublisher } from "../src/modules/listados/events/in-memory-event-publisher";
import type { ListadoEventoPayload } from "../src/modules/listados/events/listados-events.types";

describe("Listados SSE & EventPublisher (Pasos 1, 2 y 3)", () => {
  let publisher: InMemoryEventPublisher;

  beforeEach(() => {
    publisher = new InMemoryEventPublisher();
  });

  it("1. Publica y recibe eventos correctamente a suscriptores activos", () => {
    const eventosRecibidos: ListadoEventoPayload[] = [];
    const unsubscribe = publisher.subscribe((evento) => {
      eventosRecibidos.push(evento);
    });

    const mockEvento: ListadoEventoPayload = {
      id: "evt-001",
      tipo: "LISTADO_CREADO",
      timestamp: new Date().toISOString(),
      listadoId: 101,
      numeroListado: "LST-101",
      departamentoId: 1,
      lineaProduccionId: 10,
      lineaCodigo: "BOTA",
      estadoGlobal: "PENDIENTE",
      frentes: [
        { tipoFrente: "DIRECTOS", estado: "PENDIENTE" },
        { tipoFrente: "INDIRECTOS", estado: "PENDIENTE" },
      ],
    };

    publisher.publish(mockEvento);

    expect(eventosRecibidos.length).toBe(1);
    expect(eventosRecibidos[0]?.id).toBe("evt-001");
    expect(eventosRecibidos[0]?.tipo).toBe("LISTADO_CREADO");
    expect(eventosRecibidos[0]?.numeroListado).toBe("LST-101");

    unsubscribe();
  });

  it("2. Limpieza de listeners: unsubscribe elimina el oyente y no recibe eventos posteriores", () => {
    const eventosRecibidos: ListadoEventoPayload[] = [];
    const unsubscribe = publisher.subscribe((evento) => {
      eventosRecibidos.push(evento);
    });

    expect(publisher.getListenerCount()).toBe(1);

    // Desuscribir
    unsubscribe();
    expect(publisher.getListenerCount()).toBe(0);

    // Emitir tras desuscripción
    publisher.publish({
      id: "evt-002",
      tipo: "FRENTE_ENTREGADO",
      timestamp: new Date().toISOString(),
      listadoId: 102,
      numeroListado: "LST-102",
      departamentoId: 1,
      lineaProduccionId: 10,
      lineaCodigo: "BOTA",
      estadoGlobal: "EN_PROCESO",
      frentes: [
        { tipoFrente: "DIRECTOS", estado: "ENTREGADO" },
        { tipoFrente: "INDIRECTOS", estado: "PENDIENTE" },
      ],
      frenteAfectado: "DIRECTOS",
    });

    expect(eventosRecibidos.length).toBe(0);
  });

  it("3. Aislamiento de fallos: un listener que lanza error no interrumpe a los demás suscriptores", () => {
    const recibidoPorSuscriptor2: ListadoEventoPayload[] = [];

    // Suscriptor 1 falla intencionalmente
    publisher.subscribe(() => {
      throw new Error("Simulación de error en socket cliente");
    });

    // Suscriptor 2 opera normalmente
    publisher.subscribe((evt) => {
      recibidoPorSuscriptor2.push(evt);
    });

    const mockEvento: ListadoEventoPayload = {
      id: "evt-003",
      tipo: "LISTADO_CANCELADO",
      timestamp: new Date().toISOString(),
      listadoId: 103,
      numeroListado: "LST-103",
      departamentoId: 1,
      lineaProduccionId: 10,
      lineaCodigo: "BOTA",
      estadoGlobal: "CANCELADO",
      frentes: [],
    };

    // No debe lanzar excepción
    expect(() => publisher.publish(mockEvento)).not.toThrow();
    expect(recibidoPorSuscriptor2.length).toBe(1);
    expect(recibidoPorSuscriptor2[0]?.listadoId).toBe(103);
  });

  it("4. Soporta eventos de lote (LOTE_TRANSICIONADO) con idsAfectados", () => {
    let eventoLoteRecibido: ListadoEventoPayload | null = null;
    publisher.subscribe((evt) => {
      if (evt.tipo === "LOTE_TRANSICIONADO") {
        eventoLoteRecibido = evt;
      }
    });

    publisher.publish({
      id: "evt-batch-001",
      tipo: "LOTE_TRANSICIONADO",
      timestamp: new Date().toISOString(),
      listadoId: 0,
      numeroListado: "LOTE",
      departamentoId: 1,
      lineaProduccionId: 10,
      lineaCodigo: "BOTA",
      estadoGlobal: "EN_PROCESO",
      frentes: [],
      idsAfectados: [201, 202, 203],
    });

    expect(eventoLoteRecibido).not.toBeNull();
    const lote = eventoLoteRecibido as unknown as ListadoEventoPayload;
    expect(lote.idsAfectados).toEqual([201, 202, 203]);
  });
});
