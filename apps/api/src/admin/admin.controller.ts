import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BillingExempt } from '../billing/decorators';
import { AdminOnly } from './admin-only.decorator';
import { AdminService } from './admin.service';
import { ListAdminNutritionistsDto } from './dto/list-admin-nutritionists.dto';

// Somente GET: o painel não altera nada. Sem @Roles — o acesso é a allowlist.
@ApiTags('admin')
@ApiBearerAuth()
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
}
