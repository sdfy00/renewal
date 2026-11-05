import cookieParser from 'cookie-parser';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173',
    credentials: true,
  });

  const doc = new DocumentBuilder()
    .setTitle('Renewal Request API')
    .setDescription('API for managing renewal requests across spaces')
    .setVersion('1.0')
    .addCookieAuth('access_token')
    .build();
  SwaggerModule.setup('api', app, SwaggerModule.createDocument(app, doc));

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
