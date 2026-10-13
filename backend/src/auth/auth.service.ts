import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { User } from '../database/entities/user.entity';
import { AppConfig } from '../config/configuration';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthUser, JwtPayload } from './auth.types';

export interface AuthResult {
  user: AuthUser;
  accessToken: string;
}

const BCRYPT_ROUNDS = 12;

// A fixed valid bcrypt hash of an arbitrary password, compared against when
// the email is unknown so login timing does not reveal whether an account
// exists (account-enumeration side channel).
const DUMMY_PASSWORD_HASH =
  '$2b$12$h0NWW1HVnHJX2Wi9MqMEqOcpFD2J3mPIJGvFboQQ2VV4JLLkOfoX6';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.usersService.create({
      email: dto.email,
      passwordHash,
      name: dto.name,
    });

    return this.buildAuthResult(user);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.usersService.findByEmail(dto.email);

    // Always run a bcrypt comparison so response timing does not reveal
    // whether the email exists.
    const passwordMatches = await bcrypt.compare(
      dto.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );

    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.buildAuthResult(user);
  }

  /** Used by the JWT strategy to resolve a token payload into a real user. */
  async validateUser(payload: JwtPayload): Promise<AuthUser | null> {
    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      return null;
    }
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    };
  }

  private buildAuthResult(user: User): AuthResult {
    const config = this.configService.getOrThrow<AppConfig>('app');
    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
      },
      accessToken: this.jwtService.sign(
        { sub: user.id, email: user.email, role: user.role, name: user.name },
        {
          secret: config.jwtSecret,
          expiresIn: config.jwtExpiresIn as JwtSignOptions['expiresIn'],
        },
      ),
    };
  }
}
