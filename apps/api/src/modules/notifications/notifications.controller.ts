import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { SessionUser } from '@clinagenda/schemas';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import { NotificationsService } from './notifications.service';

/** Avisos de la persona que tiene la sesión abierta (los del paciente están en /portal/notifications). */
@ApiTags('Notificaciones')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.notifications.list({ userId: user.id });
  }

  @Post('read-all')
  @HttpCode(200)
  readAll(@CurrentUser() user: SessionUser) {
    return this.notifications.markAllRead({ userId: user.id });
  }

  @Post(':id/read')
  @HttpCode(200)
  read(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: SessionUser) {
    return this.notifications.markRead({ userId: user.id }, id);
  }
}
