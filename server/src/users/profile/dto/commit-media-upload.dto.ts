import { IsInt, Min } from 'class-validator';
export class CommitMediaUploadDto {
  @IsInt() @Min(0) expectedRevision!: number;
}
