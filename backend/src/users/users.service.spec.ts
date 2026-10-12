import { ConflictException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { UsersService } from './users.service';
import { User } from '../database/entities/user.entity';

describe('UsersService', () => {
  let service: UsersService;
  let repository: jest.Mocked<Pick<Repository<User>, 'create' | 'save' | 'findOne'>>;
  let queryBuilder: { addSelect: jest.Mock; where: jest.Mock; getOne: jest.Mock };

  beforeEach(() => {
    repository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
    };
    queryBuilder = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
    };
    const repoWithBuilder = {
      ...repository,
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    } as never;
    service = new UsersService(repoWithBuilder);
  });

  it('findByEmail loads the password hash explicitly for login', async () => {
    queryBuilder.getOne.mockResolvedValue({ id: 'u1', email: 'a@b.com' });

    await service.findByEmail('a@b.com');

    expect(queryBuilder.addSelect).toHaveBeenCalledWith('user.passwordHash');
    expect(queryBuilder.where).toHaveBeenCalledWith('user.email = :email', {
      email: 'a@b.com',
    });
  });

  it('maps a concurrent duplicate-email violation to a 409 Conflict', async () => {
    repository.create.mockReturnValue({ id: 'u1' } as never);
    repository.save.mockRejectedValue({ code: '23505' } as never);

    await expect(
      service.create({
        email: 'a@b.com',
        passwordHash: 'x',
        name: 'A',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates a customer by default', async () => {
    const saved = { id: 'u1', role: 'customer' };
    repository.create.mockImplementation((input) => input as never);
    repository.save.mockResolvedValue(saved as never);

    await expect(
      service.create({ email: 'a@b.com', passwordHash: 'x', name: 'A' }),
    ).resolves.toEqual(saved);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'customer' }),
    );
  });
});
