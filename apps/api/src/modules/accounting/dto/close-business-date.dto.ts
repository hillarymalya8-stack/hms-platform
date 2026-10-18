import { IsBoolean, IsOptional } from "class-validator";

export class CloseBusinessDateDto {
  /** When true, the close proceeds even if draft journals are still waiting to be posted. */
  @IsOptional()
  @IsBoolean()
  allowDraftJournals?: boolean;
}
