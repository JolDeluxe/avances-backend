import { EventEmitter } from "node:events";
import { logger } from "../../../utils/logger";
import type { IEventPublisher, ListadoEventoPayload, EventListener } from "./listados-events.types";

/**
 * Implementación en memoria del publicador de eventos utilizando EventEmitter.
 *
 * Características de seguridad y robustez:
 * - maxListeners configurado para admitir clientes concurrentes de forma controlada.
 * - Limpieza estricta de listeners mediante la función devuelta por subscribe().
 * - Captura y aislamiento de errores en listeners para que un suscriptor con fallo no detenga a los demás.
 * - Registro estructurado de eventos y conexiones.
 */
export class InMemoryEventPublisher implements IEventPublisher {
  private emitter: EventEmitter;
  private readonly EVENT_NAME = "listado_evento";

  constructor(maxListeners = 500) {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(maxListeners);
  }

  publish(event: ListadoEventoPayload): void {
    try {
      this.emitter.emit(this.EVENT_NAME, event);
      logger.debug(
        { eventoTipo: event.tipo, listadoId: event.listadoId, listeners: this.getListenerCount() },
        "Evento de listado emitido en memoria"
      );
    } catch (err) {
      logger.error({ err, event }, "Error al emitir evento de listado en memoria");
    }
  }

  subscribe(listener: EventListener<ListadoEventoPayload>): () => void {
    const safeListener = (data: ListadoEventoPayload) => {
      try {
        listener(data);
      } catch (err) {
        logger.error({ err, eventoId: data.id }, "Error en consumidor de evento de listado");
      }
    };

    this.emitter.on(this.EVENT_NAME, safeListener);

    // Retorna función de desuscripción segura
    return () => {
      this.emitter.removeListener(this.EVENT_NAME, safeListener);
    };
  }

  getListenerCount(): number {
    return this.emitter.listenerCount(this.EVENT_NAME);
  }
}

// Instancia singleton compartida en el proceso backend
export const listadosEventPublisher: IEventPublisher = new InMemoryEventPublisher();
