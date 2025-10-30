#!/usr/bin/env node

/**
 * Generate JWT Secret
 * Generates a cryptographically secure random string for JWT_SECRET
 * 
 * Usage:
 *   node scripts/generate-jwt-secret.js
 *   npm run generate-secret
 */

const crypto = require('crypto');

function generateJWTSecret(length = 64) {
  // Generate random bytes and convert to base64
  const secret = crypto.randomBytes(length).toString('base64');
  return secret;
}

function generateHexSecret(length = 64) {
  // Generate random bytes and convert to hex
  const secret = crypto.randomBytes(length).toString('hex');
  return secret;
}

console.log('\n🔐 JWT Secret Generator\n');
console.log('━'.repeat(80));
console.log('\n📝 Copy ONE of these secrets and add it to your Vercel environment variables:\n');

// Generate multiple options
console.log('Option 1 (Base64 - Recommended):');
console.log('─'.repeat(80));
console.log(generateJWTSecret());
console.log('');

console.log('Option 2 (Base64 - Shorter):');
console.log('─'.repeat(80));
console.log(generateJWTSecret(32));
console.log('');

console.log('Option 3 (Hex):');
console.log('─'.repeat(80));
console.log(generateHexSecret(32));
console.log('');

console.log('━'.repeat(80));
console.log('\n✅ Add to Vercel:');
console.log('   1. Go to: https://vercel.com → Your Project → Settings → Environment Variables');
console.log('   2. Add: JWT_SECRET=<paste-one-of-the-secrets-above>');
console.log('   3. Select: Production environment');
console.log('   4. Save and redeploy\n');

console.log('💡 Security Tips:');
console.log('   • Use a different secret for dev/staging/production');
console.log('   • Never commit secrets to git');
console.log('   • Rotate secrets periodically (every 6-12 months)');
console.log('   • Keep secrets at least 32 characters long\n');

