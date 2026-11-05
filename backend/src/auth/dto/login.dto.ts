import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'initiator-alpha' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  username: string;

  @ApiProperty({ example: 'password' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  password: string;
}
