import { IsIn, IsInt, Min } from 'class-validator';
import type { MediaPurpose } from '../profile.types';
export class CreateMediaUploadDto {
  @IsIn(['AVATAR', 'WALLPAPER']) purpose!: MediaPurpose;
  @IsIn(['image/jpeg', 'image/png', 'image/webp']) contentType!: string;
  @IsInt() @Min(1) byteSize!: number;
}
