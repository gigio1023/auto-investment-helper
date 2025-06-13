import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { ValidationPipe } from '@nestjs/common';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
      }),
    );

    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Investment Helper API is running!');
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('status');
        expect(res.body).toHaveProperty('info');
        expect(res.body).toHaveProperty('details');
        expect(res.body.info).toHaveProperty('database');
        expect(res.body.info).toHaveProperty('gemini');
      });
  });

  describe('/reports', () => {
    it('/reports (GET)', () => {
      return request(app.getHttpServer())
        .get('/reports')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('reports');
          expect(res.body).toHaveProperty('total');
          expect(res.body).toHaveProperty('page');
          expect(res.body).toHaveProperty('limit');
          expect(Array.isArray(res.body.reports)).toBe(true);
        });
    });

    it('/reports with pagination (GET)', () => {
      return request(app.getHttpServer())
        .get('/reports?page=1&limit=5')
        .expect(200)
        .expect((res) => {
          expect(res.body.page).toBe(1);
          expect(res.body.limit).toBe(5);
        });
    });

    it('/reports/date/:date (GET)', () => {
      const testDate = new Date().toISOString().split('T')[0];
      return request(app.getHttpServer())
        .get(`/reports/date/${testDate}`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('/reports/generate/morning (POST)', () => {
      return request(app.getHttpServer())
        .post('/reports/generate/morning')
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('success', true);
          expect(res.body).toHaveProperty('report');
          expect(res.body.report).toHaveProperty('id');
          expect(res.body.report).toHaveProperty('title');
          expect(res.body.report).toHaveProperty('content');
          expect(res.body.report).toHaveProperty('summary');
          expect(res.body.report.reportType).toBe('morning');
        });
    }, 30000); // 30초 타임아웃 (AI 분석 시간 고려)

    it('/reports/generate/evening (POST)', () => {
      return request(app.getHttpServer())
        .post('/reports/generate/evening')
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('success', true);
          expect(res.body).toHaveProperty('report');
          expect(res.body.report).toHaveProperty('id');
          expect(res.body.report).toHaveProperty('title');
          expect(res.body.report).toHaveProperty('content');
          expect(res.body.report).toHaveProperty('summary');
          expect(res.body.report.reportType).toBe('evening');
        });
    }, 30000); // 30초 타임아웃 (AI 분석 시간 고려)
  });

  describe('Error handling', () => {
    it('/reports/:id with invalid id (GET)', () => {
      return request(app.getHttpServer()).get('/reports/invalid').expect(400);
    });

    it('/reports/:id with non-existent id (GET)', () => {
      return request(app.getHttpServer())
        .get('/reports/99999')
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual({});
        });
    });

    it('/reports/generate with invalid type (POST)', () => {
      return request(app.getHttpServer())
        .post('/reports/generate/invalid')
        .expect(400);
    });
  });
});
