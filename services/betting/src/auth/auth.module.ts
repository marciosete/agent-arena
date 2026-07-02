import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailService } from './email.service';

/**
 * Passwordless email + OTP auth and account provisioning. PrismaService is
 * provided globally by PrismaModule, so it isn't re-declared here.
 */
@Module({
  controllers: [AuthController],
  providers: [AuthService, EmailService],
  exports: [AuthService],
})
export class AuthModule {}
