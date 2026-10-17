import { useEffect, useState } from 'react';
import { auth } from '../../firebase/auth';
import { fetchChatPhoto } from '../../services/section10Chat';
import { usePrincipalFence } from '../../hooks/usePrincipalFence';

export default function ProtectedChatImage({ referenceId, staff = false, alt = 'Private chat photo', thumbnail = false }) {
  const scope = `${auth.currentUser?.uid}:${staff}:${referenceId}`;
  const [source, setSource] = useState(null), [unavailable, setUnavailable] = useState(false);
  const fence = usePrincipalFence(scope, () => { setSource(null); setUnavailable(true); });

  useEffect(() => {
    if (!referenceId || !auth.currentUser) return undefined;
    const ticket = fence.begin(), uid = ticket.uid;
    let live = true, objectUrl = '';
    fetchChatPhoto(referenceId, { staff, principalUid: uid }).then(blob => {
      if (!live || !fence.current(ticket)) return;
      objectUrl = URL.createObjectURL(blob); setSource({ scope, url: objectUrl }); setUnavailable(false);
    }).catch(() => { if (live && fence.current(ticket)) setUnavailable(true); });
    return () => { live = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [referenceId, staff, scope, fence]);

  if (source?.scope === scope) return <img src={source.url} alt={alt} loading="lazy" decoding="async" className={thumbnail ? 'chat-private-photo chat-private-photo--thumbnail' : 'chat-private-photo'} />;
  return <span className="chat-private-photo__unavailable" role={unavailable ? 'status' : undefined}>{unavailable ? 'Private photo unavailable' : 'Checking private photo…'}</span>;
}
