import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { QuerySummaryDto } from './dto/query-summary.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/user-role.enum';

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Roles(UserRole.ADMIN)
  @Get('order-summary')
  getOrderSummary(@Query() query: QuerySummaryDto): Promise<unknown> {
    return this.reportsService.getOrderSummary(query);
  }
}
