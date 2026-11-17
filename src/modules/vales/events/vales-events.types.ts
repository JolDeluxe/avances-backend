import type { AreaVale, EstadoVale } from "@prisma/client";

export type ValeEventoTipo =
  | "VALE_CREADO"
  | "VALE_EDITADO"
  | "VALE_SEPARADO"
  | "VALE_ENTREGADO"
  | "VALE_SEPARADO_Y_ENTREGADO"
  | "VALE_DESCONTADO"
  | "VALE_RETROCEDIDO"
  | "VALE_CANCELADO"
  | "VALES_LOTE_OPERADO";

export interface ValeLoteEventoItem {
  id: number;
  area: AreaVale;
  departamentoValeId: number;
}

export interface ValeEventoPayload {
  id: string;
  tipo: ValeEventoTipo;
  valeId?: number;
  valeIds?: number[];
  loteItems?: ValeLoteEventoItem[];
  folio?: string;
  serieId?: number;
  serieCodigo?: string;
  departamentoId: number;
  departamentoValeId?: number;
  departamentoValeNombre?: string;
  area?: AreaVale;
  areas?: AreaVale[];
  departamentoValeIds?: number[];
  estadoAnterior?: EstadoVale | null;
  estadoNuevo?: EstadoVale;
  actorId: number;
  actorNombre?: string;
  motivo?: string | null;
  fechaEvento: string;
}

export type ValeEventListener = (event: ValeEventoPayload) => void;

export interface IValesEventPublisher {
  publish(event: ValeEventoPayload): void;
  subscribe(listener: ValeEventListener): () => void;
  getListenerCount(): number;
}
