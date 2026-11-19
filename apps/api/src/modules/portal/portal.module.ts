import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module';
import { PublicModule } from '../public/public.module';
import { PatientsModule } from '../patients/patients.module';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';
import { PatientAuthGuard } from './patient-auth.guard';

@Module({
  imports: [AppointmentsModule, PublicModule, PatientsModule],
  controllers: [PortalController],
  providers: [PortalService, PatientAuthGuard],
  exports: [PortalService],
})
export class PortalModule {}
