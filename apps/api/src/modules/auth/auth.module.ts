import { Module } from '@nestjs/common';
import { PortalModule } from '../portal/portal.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [PortalModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
