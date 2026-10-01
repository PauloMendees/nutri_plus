import { Controller, Get, Param, Query, StreamableFile } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { BillingExempt } from '../billing/decorators';
import { AdminOnly } from './admin-only.decorator';
import { AdminService } from './admin.service';
import { ListAdminPatientsDto } from './dto/list-admin-patients.dto';
import { AdminNutritionistFiltersDto, ListAdminNutritionistsDto } from './dto/list-admin-nutritionists.dto';

// Somente GET: o painel não altera nada. Sem @Roles — o acesso é a allowlist.
// Fora do Swagger: o painel é oculto, e o /docs não pode revelar que ele existe.
@ApiExcludeController()
@Controller({ path: 'admin', version: '1' })
@AdminOnly()
@BillingExempt()
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('nutritionists')
  listNutritionists(@Query() q: ListAdminNutritionistsDto) {
    const { page = 1, pageSize = 20, ...filters } = q;
    return this.admin.listNutritionists(filters, page, pageSize);
  }

  // Declarada antes de 'nutritionists/:id': senão "report.pdf" casaria como id.
  @Get('nutritionists/report.pdf')
  async nutritionistsReport(@Query() q: AdminNutritionistFiltersDto): Promise<StreamableFile> {
    const { buffer, fileName } = await this.admin.nutritionistsReport(q);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${fileName}"`,
    });
  }

  @Get('nutritionists/:id')
  nutritionistDetail(@Param('id') id: string) {
    return this.admin.nutritionistDetail(id);
  }

  @Get('patients')
  listPatients(@Query() q: ListAdminPatientsDto) {
    return this.admin.listPatients(q.search, q.page ?? 1, q.pageSize ?? 20);
  }
}
