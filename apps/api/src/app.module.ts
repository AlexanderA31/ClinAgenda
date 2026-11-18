import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ZodValidationPipe } from 'nestjs-zod';
import { env } from './config/env';
import { PrismaModule } from './prisma/prisma.module';
import { AuthGuard } from './common/guards/auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { AuditModule } from './modules/audit/audit.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { PortalModule } from './modules/portal/portal.module';
import { ClinicsModule } from './modules/clinics/clinics.module';
import { DoctorsModule } from './modules/doctors/doctors.module';
import { PatientsModule } from './modules/patients/patients.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { WaitlistModule } from './modules/waitlist/waitlist.module';
import { ReportsModule } from './modules/reports/reports.module';
import { ImportsModule } from './modules/imports/imports.module';
import { HealthModule } from './modules/health/health.module';
import { PublicModule } from './modules/public/public.module';
import { SystemModule } from './modules/system/system.module';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({ global: true, secret: env.JWT_SECRET, signOptions: { expiresIn: env.JWT_EXPIRES_IN as `${number}h` } }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    AuditModule,
    NotificationsModule,
    AuthModule,
    UsersModule,
    RolesModule,
    PortalModule,
    ClinicsModule,
    DoctorsModule,
    PatientsModule,
    AppointmentsModule,
    WaitlistModule,
    ReportsModule,
    ImportsModule,
    HealthModule,
    PublicModule,
    SystemModule,
  ],
  providers: [
    // Orden: límite de peticiones -> sesión -> rol.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
