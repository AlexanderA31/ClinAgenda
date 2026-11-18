import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module';
import { PublicModule } from '../public/public.module';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';
import { PatientAuthGuard } from './patient-auth.guard';

@Module({
  imports: [AppointmentsModule, PublicModule],
  controllers: [PortalController],
  providers: [PortalService, PatientAuthGuard],
})
export class PortalModule {}
