import type { EstadoListado, EstadoFrenteMaterial, TipoFrenteMaterial } from "@prisma/client";

export type TipoEventoListado =
  | "LISTADO_CREADO"
  | "LISTADO_ACTUALIZADO"
  | "FRENTE_SEPARADO"
  | "FRENTE_ENTREGADO"
  | "FRENTE_DESCONTADO"
  | "FRENTE_RETROCEDIDO"
  | "LISTADO_CANCELADO"
  | "LOTE_TRANSICIONADO";

export interface FrenteEventoPayload {
  tipoFrente: TipoFrenteMaterial;
  estado: EstadoFrenteMaterial;
}

export interface ListadoEventoPayload {
  id: string; // Identificador único secuencial o UUID del evento
  tipo: TipoEventoListado;
  timestamp: string; // ISO 8601
  listadoId: number;
  numeroListado: string;
  departamentoId: number;
  lineaProduccionId: number;
  lineaCodigo: string;
  estadoGlobal: EstadoListado;
  frentes: FrenteEventoPayload[];
  frenteAfectado?: TipoFrenteMaterial;
  idsAfectados?: number[]; // Presente en operaciones en lote
}

export type EventListener<T> = (data: T) => void;

export interface IEventPublisher {
  publish(event: ListadoEventoPayload): Promise<void> | void;
  subscribe(listener: EventListener<ListadoEventoPayload>): () => void;
  getListenerCount(): number;
}
