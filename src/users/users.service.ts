import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Users } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(Users)
    private usersRepository: Repository<Users>,
  ) {}

  async register(username: string, password: string) {
    const user = await this.usersRepository.findOneBy({ username });
    if (user) {
      throw new HttpException('alreadyExist', HttpStatus.CONFLICT);
    }
    return await this.usersRepository.insert({ username, password });
  }

  async findOne(username: string): Promise<Users | null> {
    return await this.usersRepository.findOneBy({ username });
  }
}
