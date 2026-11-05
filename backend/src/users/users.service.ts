import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  findByUsername(username: string): Promise<User | null> {
    return this.usersRepo.findOne({
      where: { username },
      relations: { spaceRoles: { space: true } },
    });
  }

  findById(id: string): Promise<User | null> {
    return this.usersRepo.findOne({
      where: { id },
      relations: { spaceRoles: { space: true } },
    });
  }
}
