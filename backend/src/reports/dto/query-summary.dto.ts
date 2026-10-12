import { IsISO8601, IsOptional } from 'class-validator';

export class QuerySummaryDto {
  @IsOptional()
  @IsISO8601({}, { message: 'from must be a valid ISO 8601 date' })
  from?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'to must be a valid ISO 8601 date' })
  to?: string;
}
