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

    it('/reports/scheduler/status (GET)', () => {
      return request(app.getHttpServer())
        .get('/reports/scheduler/status')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('morningReport');
          expect(res.body).toHaveProperty('eveningReport');
          expect(res.body).toHaveProperty('timezone', 'Asia/Seoul');
          expect(res.body).toHaveProperty('currentTime');
          expect(res.body.morningReport).toHaveProperty('enabled', true);
          expect(res.body.eveningReport).toHaveProperty('enabled', true);
        });
    });
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

    it('/reports/test/generate with invalid type (POST)', () => {
      return request(app.getHttpServer())
        .post('/reports/test/generate/invalid')
        .expect(400);
    });
  });
});
