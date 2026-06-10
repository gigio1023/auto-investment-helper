import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ReportsModule } from './modules/reports/reports.module';
import { NewsModule } from './modules/news/news.module';
import { LlmModule } from './modules/llm/llm.module';
import { RiskGateModule } from './modules/risk-gate/risk-gate.module';
import { ControlPlaneModule } from './modules/control-plane/control-plane.module';
import { V1PilotModule } from './modules/v1-pilot/v1-pilot.module';
import { databaseEntities, databaseMigrations } from './data-source';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'better-sqlite3',
        database: configService.get('DATABASE_PATH', 'data/investment.db'),
        entities: databaseEntities,
        migrations: databaseMigrations,
        migrationsTableName: 'schema_migrations',
        migrationsRun: configService.get('TYPEORM_MIGRATIONS_RUN') === 'true',
        migrationsTransactionMode: 'all',
        synchronize:
          configService.get('TYPEORM_SYNCHRONIZE', 'false') === 'true',
        autoLoadEntities: true,
      }),
      inject: [ConfigService],
    }),
    ScheduleModule.forRoot(),
    ReportsModule,
    NewsModule,
    LlmModule,
    RiskGateModule,
    ControlPlaneModule,
    V1PilotModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
