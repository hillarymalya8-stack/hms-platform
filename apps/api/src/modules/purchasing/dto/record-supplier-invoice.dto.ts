import { IsISO8601, IsNotEmpty, IsNumberString, IsOptional, IsString, MaxLength } from "class-validator";

export class RecordSupplierInvoiceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  invoiceNumber!: string;

  @IsISO8601()
  invoiceDate!: string;

  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  // Invoice value before tax; this is what is matched against the value of goods received.
  @IsNumberString()
  subtotal!: string;

  @IsOptional()
  @IsNumberString()
  taxTotal?: string;
}
