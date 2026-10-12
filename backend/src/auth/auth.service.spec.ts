import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { User } from '../database/entities/user.entity';
import { UserRole } from '../users/user-role.enum';

jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

describe('AuthService', () => {
  let authService: AuthService;
  let usersService: jest.Mocked<Pick<UsersService, 'findByEmail' | 'findById' | 'create'>>;
  let jwtService: jest.Mocked<Pick<JwtService, 'sign'>>;

  const configService = {
    getOrThrow: jest.fn().mockReturnValue({
      jwtSecret: 'test-secret',
      jwtExpiresIn: '1d',
    }),
  } as unknown as ConfigService;

  const baseUser: User = {
    id: 'u1',
    email: 'jane@example.com',
    passwordHash: 'hashed',
    name: 'Jane Doe',
    role: UserRole.CUSTOMER,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    usersService = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
    };
    jwtService = {
      sign: jest.fn().mockReturnValue('signed-token'),
    };
    authService = new AuthService(
      usersService as never,
      jwtService as never,
      configService as never,
    );
  });

  describe('register', () => {
    it('hashes the password and returns a token', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockImplementation(async ({ passwordHash }) => ({
        ...baseUser,
        passwordHash,
      }));
      mockedBcrypt.hash.mockResolvedValue('hashed' as never);

      const result = await authService.register({
        name: 'Jane Doe',
        email: 'jane@example.com',
        password: 'Passw0rd',
      });

      expect(mockedBcrypt.hash).toHaveBeenCalledWith('Passw0rd', 12);
      expect(usersService.create).toHaveBeenCalledWith({
        email: 'jane@example.com',
        passwordHash: 'hashed',
        name: 'Jane Doe',
      });
      expect(result.accessToken).toBe('signed-token');
      expect(result.user.role).toBe(UserRole.CUSTOMER);
    });

    it('rejects a duplicate email', async () => {
      usersService.findByEmail.mockResolvedValue(baseUser);

      await expect(
        authService.register({
          name: 'Jane Doe',
          email: 'jane@example.com',
          password: 'Passw0rd',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(usersService.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('returns a token for valid credentials', async () => {
      usersService.findByEmail.mockResolvedValue(baseUser);
      mockedBcrypt.compare.mockResolvedValue(true as never);

      const result = await authService.login({
        email: 'jane@example.com',
        password: 'Passw0rd',
      });

      expect(result.user.id).toBe('u1');
      expect(result.accessToken).toBe('signed-token');
    });

    it('rejects an unknown email', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        authService.login({ email: 'ghost@example.com', password: 'Passw0rd' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a wrong password', async () => {
      usersService.findByEmail.mockResolvedValue(baseUser);
      mockedBcrypt.compare.mockResolvedValue(false as never);

      await expect(
        authService.login({ email: 'jane@example.com', password: 'wrong' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('validateUser', () => {
    it('returns an AuthUser for a known id', async () => {
      usersService.findById.mockResolvedValue(baseUser);
      const user = await authService.validateUser({
        sub: 'u1',
        email: 'jane@example.com',
        role: UserRole.CUSTOMER,
        name: 'Jane Doe',
      });

      expect(user).toEqual({
        id: 'u1',
        email: 'jane@example.com',
        role: UserRole.CUSTOMER,
        name: 'Jane Doe',
      });
    });

    it('returns null for an unknown id', async () => {
      usersService.findById.mockResolvedValue(null);
      const user = await authService.validateUser({
        sub: 'missing',
        email: 'x@example.com',
        role: UserRole.CUSTOMER,
        name: 'X',
      });

      expect(user).toBeNull();
    });
  });
});
