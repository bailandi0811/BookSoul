import {
  Equals,
  IsInt,
  IsObject,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';
import type { WallpaperSelection } from '../profile.types';

export class UpdateProfileDto {
  @IsInt() @Min(0) expectedRevision!: number;
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  name?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Equals(true)
  resetAvatar?: true;
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsObject()
  wallpaper?: WallpaperSelection;
}
