import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../../src/app';

describe('phase4 app route isolation', () => {
  it('returns health status for allowed host', async () => {
    const response = await request(app)
      .get('/health')
      .set('Host', 'localhost');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'UP' });
  });

  it('blocks requests from unauthorized host', async () => {
    const response = await request(app)
      .get('/health')
      .set('Host', 'evil.example.com');

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ message: 'Forbidden: Host not allowed.' });
  });

  it('returns validation error for malformed login payload', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set('Host', 'localhost')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      status: 'fail',
      message: 'Validation Failed',
    });
    expect(response.body.errors).toHaveProperty('email');
  });

  it('returns unauthorized when validate-token is called without cookie', async () => {
    const response = await request(app)
      .get('/api/auth/validate-token')
      .set('Host', 'localhost');

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      status: 'fail',
      message: 'Unauthorized: No token provided',
    });
  });
});