import type { Request, Response } from "express";
import { departmentsService } from "./departments.service";
import { sendSuccess, sendCreated } from "../../utils/response";

export class DepartmentsController {
  async getDepartments(req: Request, res: Response): Promise<Response> {
    const soloActivos = req.query.incluirInactivos === "true" ? false : true;
    const departamentos = await departmentsService.getDepartments(soloActivos);
    return sendSuccess(res, departamentos, "Departamentos obtenidos exitosamente");
  }

  async getDepartmentById(req: Request, res: Response): Promise<Response> {
    const id = Number(req.params.id);
    const departamento = await departmentsService.getDepartmentById(id, true);
    return sendSuccess(res, departamento, "Departamento obtenido exitosamente");
  }

  async createDepartment(req: Request, res: Response): Promise<Response> {
    const departamento = await departmentsService.createDepartment(req.body, req.user?.usuarioId);
    return sendCreated(res, departamento, "Departamento creado exitosamente");
  }

  async updateDepartment(req: Request, res: Response): Promise<Response> {
    const id = Number(req.params.id);
    const departamento = await departmentsService.updateDepartment(id, req.body, req.user?.usuarioId);
    return sendSuccess(res, departamento, "Departamento actualizado exitosamente");
  }

  async deleteDepartment(req: Request, res: Response): Promise<Response> {
    const id = Number(req.params.id);
    const resultado = await departmentsService.deleteDepartment(id, req.user?.usuarioId);
    return sendSuccess(res, resultado, "Departamento inactivado exitosamente");
  }

  async createLine(req: Request, res: Response): Promise<Response> {
    const departmentId = Number(req.params.id);
    const linea = await departmentsService.createLine(departmentId, req.body, req.user?.usuarioId);
    return sendCreated(res, linea, "Línea de producción creada exitosamente");
  }

  async updateLine(req: Request, res: Response): Promise<Response> {
    const lineId = Number(req.params.lineId);
    const linea = await departmentsService.updateLine(lineId, req.body, req.user?.usuarioId);
    return sendSuccess(res, linea, "Línea de producción actualizada exitosamente");
  }

  async deleteLine(req: Request, res: Response): Promise<Response> {
    const lineId = Number(req.params.lineId);
    const resultado = await departmentsService.deleteLine(lineId, req.user?.usuarioId);
    return sendSuccess(res, resultado, "Línea de producción inactivada exitosamente");
  }

  async reorderLineas(req: Request, res: Response): Promise<Response> {
    const resultado = await departmentsService.reorderLineas(req.body.items, req.user?.usuarioId);
    return sendSuccess(res, resultado, "Líneas de producción reordenadas exitosamente");
  }
}

export const departmentsController = new DepartmentsController();
