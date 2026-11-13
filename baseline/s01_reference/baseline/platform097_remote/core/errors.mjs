export class HubError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
export function fail(code, message, status = 400) { throw new HubError(code, message, status); }
export const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function requireObject(value) { if (!object(value)) fail('INVALID_OBJECT', 'Ein JSON-Objekt wird benötigt.'); return value; }
export function text(value, max = 160, label = 'Wert') {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f]/.test(value)) fail('INVALID_TEXT', `${label} ist nicht gültig.`);
  return value.trim();
}
export function publicError(error) {
  if (error instanceof HubError) return { error: error.code, message: error.message };
  // Upstream messages, filenames and credentials never become user-facing errors.
  const code = typeof error?.code === 'string' && /^[A-Z][A-Z_0-9]{2,70}$/.test(error.code) ? error.code : 'INTERNAL_ERROR';
  if(error?.safe===true&&code!=='INTERNAL_ERROR'&&typeof error.message==='string'&&error.message.length<=600)return {error:code,message:error.message};
  return { error: code, message: 'Die Aktion konnte nicht bestätigt werden. Verbindung und Diagnose prüfen.' };
}
