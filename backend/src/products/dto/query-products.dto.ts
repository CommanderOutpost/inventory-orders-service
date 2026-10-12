import { Type } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

const SORTABLE_FIELDS = ['name', 'price', 'stock', 'createdAt'] as const;
export type ProductSortField = (typeof SORTABLE_FIELDS)[number];

export class QueryProductsDto extends PaginationDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsIn(SORTABLE_FIELDS)
  sortBy?: ProductSortField = 'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';

  /** When true (admin), archived/inactive products are included. */
  @IsOptional()
  @Type(() => Boolean)
  includeInactive?: boolean = false;
}
