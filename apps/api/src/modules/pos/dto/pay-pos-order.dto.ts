import { PaymentMethod } from "@prisma/client";
import { IsEnum, IsOptional, IsString } from "class-validator";

export class PayPosOrderDto {
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsString()
  amount!: string;

  @IsOptional()
  @IsString()
  externalReceiptNumber?: string;

  @IsOptional()
  @IsString()
  authorizationCode?: string;

  @IsOptional()
  @IsString()
  externalReference?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
