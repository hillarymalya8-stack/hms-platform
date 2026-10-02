import { IsIn, IsOptional, IsString } from "class-validator";

export const persistenceStages = ["PREVIEW", "SCHEMA_READY", "API_READY", "DB_READY", "BLOCKED"] as const;

export type PersistenceStage = (typeof persistenceStages)[number];

export class RecordTransitionDto {
  @IsString()
  moduleId!: string;

  @IsIn(persistenceStages)
  targetStage!: PersistenceStage;

  @IsOptional()
  @IsString()
  note?: string;
}
