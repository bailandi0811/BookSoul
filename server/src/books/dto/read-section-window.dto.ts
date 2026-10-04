import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class ReadSectionWindowDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  offset = 0;

  @Type(() => Number)
  @IsInt()
  @Min(1024)
  @Max(32000)
  limit = 16000;
}
