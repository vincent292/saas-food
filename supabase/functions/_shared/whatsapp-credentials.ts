// Web Crypto format shared by Next.js and Supabase Edge Functions.
// AAD binds a ciphertext to a branch so copying it cannot change its tenant.
function bytesFromBase64(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}
function base64FromBytes(value: Uint8Array) {
  return btoa(Array.from(value, (byte) => String.fromCharCode(byte)).join(''));
}
async function encryptionKey(secret: string) {
  const bytes = bytesFromBase64(secret);
  if (bytes.length !== 32) throw new Error('invalid-whatsapp-encryption-key');
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function encryptWhatsAppToken(token: string, secret: string, restaurantId: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(restaurantId) },
    await encryptionKey(secret), new TextEncoder().encode(token),
  );
  return `v1.${base64FromBytes(iv)}.${base64FromBytes(new Uint8Array(ciphertext))}`;
}
export async function decryptWhatsAppToken(value: string, secret: string, restaurantId: string) {
  const [version, iv, ciphertext, extra] = value.split('.');
  if (version !== 'v1' || !iv || !ciphertext || extra) throw new Error('invalid-whatsapp-ciphertext');
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytesFromBase64(iv), additionalData: new TextEncoder().encode(restaurantId) },
    await encryptionKey(secret), bytesFromBase64(ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}
