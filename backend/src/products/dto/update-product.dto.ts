import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUppercase,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpdateProductDto {
  @ValidateIf((o) => o.name !== undefined)
  @IsString()
  @Length(2, 200)
  name?: string;

  @ValidateIf((o) => o.sku !== undefined)
  @IsString()
  @Length(2, 50)
  @IsUppercase({ message: 'SKU must be uppercase' })
  @Matches(/^[A-Z0-9_-]+$/, {
    message: 'SKU may only contain uppercase letters, numbers, dashes and underscores',
  })
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ValidateIf((o) => o.price !== undefined)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'Price must be greater than 0' })
  @Max(9_999_999.99, { message: 'Price is too large' })
  price?: number;

  @ValidateIf((o) => o.stock !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  stock?: number;

  @ValidateIf((o) => o.isActive !== undefined)
  @IsBoolean()
  isActive?: boolean;
}
