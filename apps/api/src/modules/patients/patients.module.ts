import { Module } from '@nestjs/common';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';
import { MedicalRecordController } from './medical-record.controller';
import { MedicalRecordService } from './medical-record.service';

@Module({
  controllers: [PatientsController, MedicalRecordController],
  providers: [PatientsService, MedicalRecordService],
  exports: [PatientsService, MedicalRecordService],
})
export class PatientsModule {}
