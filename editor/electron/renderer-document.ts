import {randomBytes} from 'node:crypto';
export function rendererDocument(bytes: string | Buffer): string {
 const nonce=randomBytes(24).toString('base64');
 return String(bytes).replaceAll('__ATELIER_STYLE_NONCE__',nonce);
}
