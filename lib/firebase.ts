import { importPKCS8, SignJWT } from 'jose';

type FirestoreValue = {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  booleanValue?: boolean;
  nullValue?: null;
  arrayValue?: { values?: FirestoreValue[] };
  mapValue?: { fields?: Record<string, FirestoreValue> };
};

type FirestoreDocument = {
  name: string;
  fields?: Record<string, FirestoreValue>;
  createTime?: string;
};

const config = () => {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  return projectId && clientEmail && privateKey ? { projectId, clientEmail, privateKey } : null;
};

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken() {
  const credentials = config();
  if (!credentials) return null;
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const now = Math.floor(Date.now() / 1000);
  const key = await importPKCS8(credentials.privateKey, 'RS256');
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/datastore' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(credentials.clientEmail)
    .setSubject(credentials.clientEmail)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!response.ok) throw new Error(`Firebase authentication failed (${response.status})`);
  const data = await response.json() as { access_token: string; expires_in: number };
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

function encode(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === 'object') return { mapValue: { fields: fields(value as Record<string, unknown>) } };
  return { stringValue: String(value) };
}

function decode(value: FirestoreValue): unknown {
  if ('stringValue' in value) return value.stringValue || '';
  if ('integerValue' in value) return Number(value.integerValue || 0);
  if ('doubleValue' in value) return value.doubleValue || 0;
  if ('booleanValue' in value) return Boolean(value.booleanValue);
  if ('arrayValue' in value) return (value.arrayValue?.values || []).map(decode);
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue?.fields || {}).map(([key, item]) => [key, decode(item)]));
  return null;
}

function fields(record: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, encode(value)]));
}

function record(document: FirestoreDocument) {
  const data = Object.fromEntries(Object.entries(document.fields || {}).map(([key, value]) => [key, decode(value)]));
  return { id: document.name.split('/').pop(), ...data };
}

async function request(path: string, init?: RequestInit) {
  const credentials = config();
  const token = await accessToken();
  if (!credentials || !token) return null;
  return fetch(`https://firestore.googleapis.com/v1/projects/${credentials.projectId}/databases/(default)/documents/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
}

export const firebaseConfigured = () => Boolean(config());

export async function listDocuments(collection: string) {
  const response = await request(`${collection}?pageSize=200`);
  if (!response) return null;
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json() as { documents?: FirestoreDocument[] };
  return (data.documents || []).map(record);
}

export async function createDocument(collection: string, data: Record<string, unknown>) {
  const response = await request(collection, { method: 'POST', body: JSON.stringify({ fields: fields(data) }) });
  if (!response) return null;
  if (!response.ok) throw new Error(await response.text());
  return record(await response.json() as FirestoreDocument);
}

export async function getDocument(collection: string, id: string) {
  const response = await request(`${collection}/${encodeURIComponent(id)}`);
  if (!response) return null;
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(await response.text());
  return record(await response.json() as FirestoreDocument);
}

export async function setDocument(collection: string, id: string, data: Record<string, unknown>) {
  const response = await request(`${collection}/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ fields: fields(data) }) });
  if (!response) return null;
  if (!response.ok) throw new Error(await response.text());
  return record(await response.json() as FirestoreDocument);
}

export async function deleteDocument(collection: string, id: string) {
  const response = await request(`${collection}/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response) return false;
  if (!response.ok) throw new Error(await response.text());
  return true;
}
