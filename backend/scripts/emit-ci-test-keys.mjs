import { generateKeyPairSync } from 'node:crypto';

if (process.env.CI !== 'true') {
  throw new Error('CI test-key emission is restricted to CI=true');
}

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

process.stdout.write(`TOKEN_SIGNING_KEY<<BNBU_PRIVATE_KEY\n${privatePem}BNBU_PRIVATE_KEY\n`);
process.stdout.write(`TOKEN_VERIFYING_KEY<<BNBU_PUBLIC_KEY\n${publicPem}BNBU_PUBLIC_KEY\n`);
