import {
  ConsoleLogger,
  ValidationPipe,
  VersioningType,
  type INestApplication,
} from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { CsrfService } from '@atlas/backend';
import cookieParser from 'cookie-parser';
import { ErrorEnvelopeFilter } from '../http/error-envelope.filter';

export function configureApplication(app: INestApplication): void {
  app.useLogger(new ConsoleLogger({ json: true }));
  app.enableCors({
    credentials: true,
    origin: process.env.API_CORS_ORIGIN ?? 'http://localhost:3000',
  });
  app.use(cookieParser());
  app.use(app.get(CsrfService).protect);
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
    prefix: 'api/v',
  });
  app.useGlobalPipes(
    new ValidationPipe({
      errorHttpStatusCode: 422,
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
  app.useGlobalFilters(new ErrorEnvelopeFilter());

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('ATLAS API').setVersion('1').build(),
  );
  SwaggerModule.setup('api/v1/docs', app, document);
}
