import { PaymentMethod } from "@prisma/client";
import { IsEnum, IsOptional, IsString } from "class-validator";

export class SettleFolioPaymentDto {
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsString()
  amount!: string;

  @IsOptional()
  @IsString()
  paymentProvider?: string;

  @IsOptional()
  @IsString()
  externalReceiptNumber?: string;
}
