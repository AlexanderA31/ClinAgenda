import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { env } from './config/env';
import { AppModule } from './app.module';
import { SESSION_COOKIE } from './common/guards/auth.guard';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: true });
  app.set('trust proxy', 1);
  app.setGlobalPrefix('api');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '200kb' });
  app.enableCors({ origin: env.WEB_ORIGIN.split(','), credentials: true });
  app.enableShutdownHooks();

  // Swagger se genera a partir de los mismos schemas Zod que valida la API y usa la web.
  const config = new DocumentBuilder()
    .setTitle('ClinAgenda API')
    .setDescription(
      'API de agendamiento de citas para Clínica Centro, Norte y Sur.\n\n' +
        'Para probar: use **POST /api/auth/login** (p. ej. usuario `paredes`), copie `accessToken` y péguelo en **Authorize**.\n\n' +
        'Todos los errores tienen la forma `{ statusCode, code, message, fields? }`; `message` está escrito para personas.',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .addCookieAuth(SESSION_COOKIE)
    .build();
  const document = cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
    swaggerOptions: { persistAuthorization: true, docExpansion: 'none', tagsSorter: 'alpha' },
    customSiteTitle: 'ClinAgenda API',
  });

  await app.listen(env.API_PORT, '0.0.0.0');
  Logger.log(`API lista en http://localhost:${env.API_PORT}/api — documentación en /api/docs`, 'ClinAgenda');
}

void bootstrap();
