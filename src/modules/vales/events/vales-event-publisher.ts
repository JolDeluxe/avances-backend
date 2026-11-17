import { EventEmitter } from "node:events";
import { logger } from "../../../utils/logger";
import type { IValesEventPublisher, ValeEventoPayload, ValeEventListener } from "./vales-events.types";

/**
 * Publicador en memoria para eventos en tiempo real (SSE) del módulo de Vales.
 * Aislado del canal de Listados para evitar tráfico o refetches cruzados entre módulos.
 */
export class ValesInMemoryEventPublisher implements IValesEventPublisher {
  private emitter: EventEmitter;
  private readonly EVENT_NAME = "vale_evento";

  constructor(maxListeners = 500) {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(maxListeners);
  }

  publish(event: ValeEventoPayload): void {
    try {
      this.emitter.emit(this.EVENT_NAME, event);
      logger.debug(
        {
          eventoTipo: event.tipo,
          valeId: event.valeId,
          valeIds: event.valeIds,
          listeners: this.getListenerCount(),
        },
        "Evento de vale emitido en memoria",
      );
    } catch (err) {
      logger.error({ err, event }, "Error al emitir evento de vale en memoria");
    }
  }

  subscribe(listener: ValeEventListener): () => void {
    const safeListener = (data: ValeEventoPayload) => {
      try {
        listener(data);
      } catch (err) {
        logger.error({ err, eventoId: data.id }, "Error en consumidor de evento de vale");
      }
    };

    this.emitter.on(this.EVENT_NAME, safeListener);

    return () => {
      this.emitter.removeListener(this.EVENT_NAME, safeListener);
    };
  }

  getListenerCount(): number {
    return this.emitter.listenerCount(this.EVENT_NAME);
  }
}

export const valesEventPublisher: IValesEventPublisher = new ValesInMemoryEventPublisher();
