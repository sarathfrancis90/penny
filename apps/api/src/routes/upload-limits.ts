/**
 * Request size limit for routes that carry a base64 photo (receipt scan,
 * receipt/avatar upload). Fastify's default is 1 MiB, which a normal phone
 * camera photo exceeds once base64-encoded. 8 MiB fits a ~6 MB image.
 */
export const PHOTO_UPLOAD_BODY_LIMIT = 8 * 1024 * 1024;
