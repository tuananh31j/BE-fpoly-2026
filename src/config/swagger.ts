import swaggerJSDoc from 'swagger-jsdoc';

import { env } from '@config/env';

export const swaggerSpec = swaggerJSDoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Poly2026 Backend API',
      version: '1.0.0',
      description: 'Base backend procedural MVC with TypeScript + Express.'
    },
    servers: [
      {
        url: `http://localhost:${env.PORT}${env.API_PREFIX}`
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    },
    paths: {
      '/health': {
        get: {
          tags: ['Health'],
          summary: 'Check service health',
          responses: {
            '200': {
              description: 'OK'
            }
          }
        }
      },
      '/auth/register': {
        post: {
          tags: ['Auth'],
          summary: 'Register account'
        }
      },
      '/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Login account'
        }
      },
      '/auth/forgot-password': {
        post: {
          tags: ['Auth'],
          summary: 'Send reset password token'
        }
      },
      '/auth/reset-password': {
        post: {
          tags: ['Auth'],
          summary: 'Reset password with token'
        }
      },
      '/auth/refresh': {
        post: {
          tags: ['Auth'],
          summary: 'Refresh access token'
        }
      },
      '/auth/logout': {
        post: {
          tags: ['Auth'],
          summary: 'Logout',
          security: [{ bearerAuth: [] }]
        }
      },
      '/auth/me': {
        get: {
          tags: ['Auth'],
          summary: 'Get current profile',
          security: [{ bearerAuth: [] }]
        }
      },
      '/upload/image': {
        post: {
          tags: ['Upload'],
          summary: 'Upload image',
          security: [{ bearerAuth: [] }]
        }
      },
      '/mail/test': {
        post: {
          tags: ['Mail'],
          summary: 'Send test email',
          security: [{ bearerAuth: [] }]
        }
      }
    }
  },
  apis: []
});
