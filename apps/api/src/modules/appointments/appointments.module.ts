import { Module } from '@nestjs/common';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { SchedulingService } from './scheduling.service';

@Module({
  controllers: [AppointmentsController],
  providers: [AppointmentsService, SchedulingService],
  exports: [AppointmentsService, SchedulingService],
})
export class AppointmentsModule {}
