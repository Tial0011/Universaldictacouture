import { auth } from '../firebase/auth';
import { accountRequest } from './accountApi';

export const CHAT_IMAGE_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);
export const CHAT_IMAGE_LIMIT = 4 * 1024 * 1024;

export function chatSourceContext(value) {
  if (!value || typeof value !== 'object') return null;
  if (typeof value.reviewId === 'string' && value.reviewId) return { kind: 'review', reviewId: value.reviewId };
  if (typeof value.productId === 'string' && value.productId) return { kind: 'product', productId: value.productId };
  return null;
}

export function mergeChatMessages(...pages) {
  const records = new Map();
  for (const message of pages.flat()) if (message?.id) records.set(message.id, message);
  return [...records.values()].sort((left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id));
}

export function chatTime(value) {
  if (!Number.isFinite(value)) return 'Time unavailable';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function shortChatTime(value) {
  if (!Number.isFinite(value)) return '';
  const date = new Date(value), today = new Date();
  return date.toDateString() === today.toDateString()
    ? new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date)
    : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

export function readFileBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(Object.assign(new Error('The selected photo could not be read.'), { code: 'invalid-media' }));
    reader.readAsDataURL(file);
  });
}

export async function stageChatPhoto({ file, chatId, expectedVersion, expectedEpoch, staff, principalUid, operationId }) {
  if (!CHAT_IMAGE_TYPES.includes(file?.type) || !file.size || file.size > CHAT_IMAGE_LIMIT) throw Object.assign(new Error('Choose a JPEG, PNG or WebP photo up to 4 MB.'), { code: 'invalid-media' });
  const base64 = await readFileBase64(file);
  return accountRequest(staff ? 'staff-media-stage' : 'media-stage', { operationId, domain: 'chat', objectId: chatId, expectedVersion, expectedEpoch, contentType: file.type, base64 }, { principalUid });
}

export async function fetchChatPhoto(referenceId, { staff = false, principalUid } = {}) {
  const user = auth.currentUser;
  if (!user || user.uid !== principalUid) throw Object.assign(new Error('Current photo access changed.'), { code: 'auth/principal-changed' });
  const token = await user.getIdToken();
  const read = () => fetch(`/.netlify/functions/account?action=${staff ? 'staff-media-deliver' : 'media-deliver'}&referenceId=${encodeURIComponent(referenceId)}`, { cache: 'no-store', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
  let response = await read();
  if (response.status === 401) {
    await accountRequest('session-start', { kind: staff ? 'staff' : 'customer', keepSignedIn: false, label: 'Current browser' }, { principalUid });
    response = await read();
  }
  if (!response.ok) throw Object.assign(new Error('Private photo access is unavailable.'), { code: response.status === 401 || response.status === 403 ? 'permission-denied' : 'account-source-unavailable' });
  return response.blob();
}
