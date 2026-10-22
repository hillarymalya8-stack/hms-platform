import { Type } from "class-transformer";
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min
} from "class-validator";

const DECIMAL = /^\d{1,12}(\.\d{1,4})?$/;
const OPTIONAL_DECIMAL = /^(\d{1,12}(\.\d{1,4})?)?$/;
// Tax rates are stored as fractions (0.16 = 16%), matching OutletProduct.taxRate.
const TAX_RATE = /^(0(\.\d{1,4})?|1(\.0{1,4})?)$/;

export class CreateProductCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;
}

export class CreatePosProductDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  @Matches(/^[A-Za-z0-9._-]+$/, { message: "SKU may only contain letters, numbers, dots, dashes and underscores." })
  sku!: string;

  @IsUUID()
  categoryId!: string;

  @IsString()
  @Matches(DECIMAL, { message: "Price must be a positive amount with up to 4 decimals." })
  price!: string;

  // Optional USD price; leave empty when the item is only sold in TSh.
  @IsOptional()
  @IsString()
  @Matches(DECIMAL, { message: "USD price must be a positive amount with up to 4 decimals." })
  priceUsd?: string;

  @IsOptional()
  @IsString()
  @Matches(TAX_RATE, { message: "Tax rate must be a fraction between 0 and 1 (0.16 = 16%)." })
  taxRate?: string;

  @IsArray()
  @ArrayUnique()
  @IsUUID("all", { each: true })
  outletIds!: string[];

  @IsOptional()
  @IsBoolean()
  stockTracked?: boolean;
}

export class UpdatePosProductDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  @Matches(DECIMAL, { message: "Price must be a positive amount with up to 4 decimals." })
  price?: string;

  // Empty string clears the USD price so the item can no longer be sold in USD.
  @IsOptional()
  @IsString()
  @Matches(OPTIONAL_DECIMAL, { message: "USD price must be a positive amount with up to 4 decimals." })
  priceUsd?: string;

  @IsOptional()
  @IsString()
  @Matches(TAX_RATE, { message: "Tax rate must be a fraction between 0 and 1 (0.16 = 16%)." })
  taxRate?: string;

  // Availability at every outlet the product is sold at (e.g. "86" an item).
  @IsOptional()
  @IsBoolean()
  available?: boolean;

  // Active=false retires the product from all menus without deleting order history.
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  // When provided, replaces the set of outlets the product is sold at.
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID("all", { each: true })
  outletIds?: string[];
}

export class CreateDiningTableDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  tableNumber!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  section?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  seats?: number;
}
