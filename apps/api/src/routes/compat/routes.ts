import type { FastifyInstance } from 'fastify';

function notImplemented(route: string) {
  return {
    success: false,
    error: 'Not implemented',
    details: `${route} is registered in the container API but not implemented yet`,
  };
}

export async function registerCompatibilityRoutes(app: FastifyInstance) {
  app.post('/api/privacy/delete-my-data', {
    preHandler: app.requireUser,
    handler: async () => notImplemented('/api/privacy/delete-my-data'),
  });

  app.get('/api/cron/store-metrics', async (request, reply) => {
    const expected = process.env.CRON_SECRET;
    if (!expected || request.headers.authorization !== `Bearer ${expected}`) {
      return reply.status(401).send({
        error: 'Unauthorized',
        details: 'Invalid cron authorization',
        requestId: reply.getHeader('x-request-id'),
      });
    }
    return notImplemented('/api/cron/store-metrics');
  });
}
