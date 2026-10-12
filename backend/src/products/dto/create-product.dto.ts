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
} from 'class-validator';

export class CreateProductDto {
  @IsString()
  @Length(2, 200)
  name: string;

  @IsString()
  @Length(2, 50)
  @IsUppercase({ message: 'SKU must be uppercase' })
  @Matches(/^[A-Z0-9_-]+$/, {
    message: 'SKU may only contain uppercase letters, numbers, dashes and underscores',
  })
  sku: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'Price must be greater than 0' })
  price: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  stock: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
