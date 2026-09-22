import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import ChatIcon from "./ChatIcon";

function ThreadMenu({ thread, onClose }) {
  const options = useMemo(() => {
    const base = [
      { icon: "search", label: "Search This Chat" },
      { icon: "gallery", label: "Photos & Videos" },
      { icon: "history", label: "Chat History with This Couturier" },
      { icon: "timeline", label: "Order Timeline" },
      { icon: "bell", label: "Notification Settings" },
    ];
    return thread.kind === "order"
      ? [{ icon: "order", label: "View Order Card" }, ...base]
      : base.filter((item) => item.label !== "Order Timeline");
  }, [thread.kind]);

  return (
    <div className="chat-menu" role="menu">
      {options.map((item) => (
        <button key={item.label} type="button" role="menuitem" onClick={onClose}>
          <ChatIcon name={item.icon} size={18} />
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

function ContextCard({ message }) {
  return (
    <div className={`chat-context chat-context--${message.contextType || "product"}`}>
      <img src={message.image} alt="" />
      <div>
        <p className="chat-context__eyebrow">{message.title}</p>
        <strong>{message.name}</strong>
        <span>{message.meta}</span>
      </div>
      <ChatIcon name={message.contextType === "review" ? "review" : "product"} size={21} />
    </div>
  );
}

function CompactOrderCard({ message }) {
  const orderId = message.orderNumber?.toLowerCase() || "udc-2048";
  return (
    <article className="chat-order-card" aria-label={`Order Card ${message.orderNumber}`}>
      <div className="chat-order-card__top">
        <span className="chat-order-card__icon"><ChatIcon name="order" size={22} /></span>
        <div>
          <p className="chat-order-card__eyebrow">Order Card</p>
          <strong>{message.orderNumber}</strong>
        </div>
        <span className="chat-order-card__edition">{message.edition}</span>
        <span className="chat-order-card__state">{message.state}</span>
      </div>

      <div className="chat-order-card__body">
        <img src={message.image} alt="Burgundy Aso Oke fabric" />
        <div className="chat-order-card__details">
          <p className="chat-order-card__order-name">{message.title}</p>
          <strong>{message.productName}</strong>
          <dl>
            <div><dt>Service Type</dt><dd>{message.serviceType}</dd></div>
            <div><dt>Quantity</dt><dd>{message.quantity}</dd></div>
            <div><dt>Order Total</dt><dd>{message.total}</dd></div>
          </dl>
        </div>
      </div>

      <Link className="chat-order-card__cta" to={`/my-closet?tab=orders&order=${encodeURIComponent(orderId)}`}>
        View Order History <span aria-hidden="true">→</span>
      </Link>
      <p className="chat-order-card__note">Frontend mockup — live order editing remains chat-centric when the transaction backend is connected.</p>
    </article>
  );
}

function MediaMessage({ message }) {
  return (
    <div className="chat-media-message" aria-label="Shared media">
      <div className="chat-media-message__grid">
        {message.images.map((src, index) => <img key={`${src}-${index}`} src={src} alt={`Fabric reference ${index + 1}`} />)}
      </div>
      <time>{message.time}</time>
    </div>
  );
}

function LocalMediaMessage({ message }) {
  return (
    <div className="chat-local-media is-customer" aria-label="Your media message">
      <div className="chat-local-media__items">
        {message.items.map((item) => (
          <div className="chat-local-media__item" key={item.id}>
            {item.kind === "video" ? (
              <video src={item.url} controls preload="metadata" />
            ) : (
              <img src={item.url} alt={item.name || "Selected upload"} />
            )}
          </div>
        ))}
      </div>
      <span className="chat-local-media__meta"><time>{message.time}</time><ChatIcon name="check" size={14} /></span>
    </div>
  );
}

function VoiceMessage({ message }) {
  return (
    <div className="chat-message-row is-customer">
      <div className="chat-message-wrap">
        <div className="chat-voice-bubble">
          <span className="chat-voice-bubble__icon"><ChatIcon name="mic" size={18} /></span>
          <audio controls src={message.audioUrl} preload="metadata">Your browser does not support audio playback.</audio>
          <span className="chat-voice-bubble__duration">{message.durationLabel}</span>
          <span className="chat-bubble__meta"><time>{message.time}</time><ChatIcon name="check" size={14} /></span>
        </div>
      </div>
    </div>
  );
}

function FileMessage({ message }) {
  return (
    <div className="chat-message-row is-customer">
      <div className="chat-message-wrap">
        <div className="chat-file-bubble">
          <ChatIcon name="clip" size={18} />
          <div><strong>{message.name}</strong><span>{message.sizeLabel}</span></div>
          <span className="chat-bubble__meta"><time>{message.time}</time><ChatIcon name="check" size={14} /></span>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message, onRetry }) {
  if (message.type === "system") {
    return <div className="chat-system-event"><ChatIcon name="pin" size={15} /><span>{message.text}</span></div>;
  }
  if (message.type === "context") return <ContextCard message={message} />;
  if (message.type === "orderCard") return <CompactOrderCard message={message} />;
  if (message.type === "media") return <MediaMessage message={message} />;
  if (message.type === "localMedia") return <LocalMediaMessage message={message} />;
  if (message.type === "voice") return <VoiceMessage message={message} />;
  if (message.type === "file") return <FileMessage message={message} />;

  const customer = message.type === "customer";
  return (
    <div className={`chat-message-row ${customer ? "is-customer" : "is-couturier"}`}>
      {!customer ? <span className="chat-avatar" aria-hidden="true">DC</span> : null}
      <div className="chat-message-wrap">
        <div className="chat-bubble">
          <p>{message.text}</p>
          <span className="chat-bubble__meta">
            <time>{message.time}</time>
            {customer && message.state === "pending" ? <span>Sending…</span> : null}
            {customer && message.state === "sent" ? <ChatIcon name="check" size={14} /> : null}
            {customer && message.state === "failed" ? (
              <button type="button" onClick={() => onRetry(message.id)} className="chat-retry"><ChatIcon name="retry" size={14} /> Retry</button>
            ) : null}
          </span>
        </div>
        <div className="chat-message-actions" aria-label="Message actions">
          <button type="button" aria-label="Reply"><ChatIcon name="reply" size={14} /></button>
          <button type="button" aria-label="Copy"><ChatIcon name="copy" size={14} /></button>
          {customer ? <button type="button" aria-label="Edit"><ChatIcon name="edit" size={14} /></button> : null}
          {customer ? <button type="button" aria-label="Delete"><ChatIcon name="trash" size={14} /></button> : null}
        </div>
      </div>
    </div>
  );
}

const formatTime = () => new Intl.DateTimeFormat("en-NG", { hour: "numeric", minute: "2-digit" }).format(new Date());
const formatDuration = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
const formatFileSize = (bytes) => bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export default function ChatWindow({ thread, onMobileBack }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [localMessages, setLocalMessages] = useState([]);
  const [pinOpen, setPinOpen] = useState(true);
  const [contextVisible, setContextVisible] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [composerNotice, setComposerNotice] = useState("");
  const viewportRef = useRef(null);
  const mediaInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const recorderRef = useRef(null);
  const recorderStreamRef = useRef(null);
  const recorderChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const objectUrlsRef = useRef(new Set());

  useEffect(() => {
    setLocalMessages([]);
    setDraft("");
    setMenuOpen(false);
    setPinOpen(true);
    setContextVisible(true);
    setComposerNotice("");
  }, [thread.id]);

  useEffect(() => {
    if (!localMessages.length) return;
    viewportRef.current?.scrollTo({ top: viewportRef.current.scrollHeight, behavior: "smooth" });
  }, [localMessages]);

  useEffect(() => () => {
    if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
    recorderStreamRef.current?.getTracks().forEach((track) => track.stop());
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const addMessage = (message) => {
    setLocalMessages((messages) => [...messages, message]);
  };

  const sendMessage = () => {
    const text = draft.trim();
    if (!text) return;
    const id = `local-${Date.now()}`;
    addMessage({ id, type: "customer", text, time: formatTime(), state: "pending" });
    setDraft("");
    window.setTimeout(() => {
      setLocalMessages((messages) => messages.map((message) => message.id === id ? { ...message, state: "sent" } : message));
    }, 350);
  };

  const retryMessage = (messageId) => {
    setLocalMessages((messages) => messages.map((message) => message.id === messageId ? { ...message, state: "pending" } : message));
    window.setTimeout(() => {
      setLocalMessages((messages) => messages.map((message) => message.id === messageId ? { ...message, state: "sent" } : message));
    }, 350);
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  const handleMediaSelect = (event) => {
    const files = Array.from(event.target.files || []).slice(0, 6);
    if (!files.length) return;
    const items = files.map((file, index) => {
      const url = URL.createObjectURL(file);
      objectUrlsRef.current.add(url);
      return {
        id: `${Date.now()}-${index}`,
        kind: file.type.startsWith("video/") ? "video" : "image",
        url,
        name: file.name,
      };
    });
    addMessage({ id: `media-${Date.now()}`, type: "localMedia", items, time: formatTime() });
    setComposerNotice(`${items.length} media ${items.length === 1 ? "item" : "items"} added to this mock chat.`);
    event.target.value = "";
  };

  const handleFileSelect = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    addMessage({
      id: `file-${Date.now()}`,
      type: "file",
      name: file.name,
      sizeLabel: formatFileSize(file.size),
      time: formatTime(),
    });
    setComposerNotice("Attachment added to this mock chat.");
    event.target.value = "";
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  };

  const startRecording = async () => {
    setComposerNotice("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setComposerNotice("Voice recording is not supported by this browser. Try Chrome, Edge, or Safari with microphone permission.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recorderStreamRef.current = stream;
      recorderChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data?.size) recorderChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const duration = recordingSeconds;
        const blob = new Blob(recorderChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const audioUrl = URL.createObjectURL(blob);
        objectUrlsRef.current.add(audioUrl);
        addMessage({
          id: `voice-${Date.now()}`,
          type: "voice",
          audioUrl,
          durationLabel: formatDuration(Math.max(duration, 1)),
          time: formatTime(),
        });
        recorderStreamRef.current?.getTracks().forEach((track) => track.stop());
        recorderStreamRef.current = null;
        setIsRecording(false);
        setRecordingSeconds(0);
        if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      };
      recorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = window.setInterval(() => setRecordingSeconds((seconds) => seconds + 1), 1000);
    } catch {
      setComposerNotice("Microphone permission was not granted. You can still send text, photos, videos and files.");
    }
  };

  const toggleRecording = () => {
    if (isRecording) stopRecording();
    else startRecording();
  };

  return (
    <section className="chat-window" aria-label={thread.title}>
      <header className="chat-window__header">
        <button className="chat-window__back" type="button" onClick={onMobileBack} aria-label="Back to conversations">
          <ChatIcon name="back" size={22} />
        </button>
        <span className="chat-avatar" aria-hidden="true">DC</span>
        <div className="chat-window__identity">
          <div className="chat-window__identity-row">
            <strong>Dicta Couturier</strong>
            <span className="chat-presence"><i /> Online</span>
          </div>
          <span>{thread.kind === "order" ? `Assigned · Order ${thread.orderNumber}` : "Private customer assistance"}</span>
        </div>
        <div className="chat-window__title-block">
          <strong>{thread.title}</strong>
          <span>{thread.status}</span>
        </div>
        <div className="chat-window__menu-wrap">
          <button type="button" className="chat-window__more" aria-label="Conversation options" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
            <ChatIcon name="more" size={22} />
          </button>
          {menuOpen ? <ThreadMenu thread={thread} onClose={() => setMenuOpen(false)} /> : null}
        </div>
      </header>

      {thread.currentPin ? (
        <div className={`current-pin${pinOpen ? " is-open" : ""}`}>
          <button type="button" className="current-pin__summary" onClick={() => setPinOpen((open) => !open)} aria-expanded={pinOpen}>
            <span className="current-pin__icon"><ChatIcon name="pin" size={17} /></span>
            <span>
              <small>{thread.currentPin.label}</small>
              <strong>{thread.currentPin.title}</strong>
            </span>
            <span className="current-pin__meta">{thread.currentPin.meta}</span>
            <span className="current-pin__chevron" aria-hidden="true">⌄</span>
          </button>
          {pinOpen ? (
            <div className="current-pin__detail">
              <span>Newest actionable object for this order.</span>
              <Link to={`/my-closet?tab=orders&order=${encodeURIComponent(thread.orderNumber?.toLowerCase() || "")}`}>View order history <span aria-hidden="true">→</span></Link>
            </div>
          ) : null}
        </div>
      ) : thread.context && contextVisible ? (
        <div className="chat-context-strip">
          <ChatIcon name={thread.context.type === "review" ? "review" : "product"} size={18} />
          <span><strong>{thread.context.title}</strong><small>{thread.context.meta}</small></span>
          <button type="button" aria-label="Dismiss context" onClick={() => setContextVisible(false)}><ChatIcon name="close" size={16} /></button>
        </div>
      ) : null}

      <div className="chat-window__messages" ref={viewportRef}>
        <div className="chat-day-label"><span>Today</span></div>
        {[...thread.messages, ...localMessages].map((message) => (
          <MessageBubble key={message.id} message={message} onRetry={retryMessage} />
        ))}
      </div>

      <footer className={`chat-composer${isRecording ? " is-recording" : ""}`}>
        <input ref={mediaInputRef} className="visually-hidden" type="file" accept="image/*,video/*" multiple onChange={handleMediaSelect} />
        <input ref={fileInputRef} className="visually-hidden" type="file" onChange={handleFileSelect} />

        {composerNotice ? <div className="chat-composer__notice" role="status">{composerNotice}</div> : null}

        <div className="chat-composer__bar">
          <button type="button" className="chat-composer__icon" aria-label="Add photo or video" title="Add photo or video" onClick={() => mediaInputRef.current?.click()}>
            <ChatIcon name="image" size={21} />
          </button>
          <button type="button" className="chat-composer__icon" aria-label="Add attachment" title="Add attachment" onClick={() => fileInputRef.current?.click()}>
            <ChatIcon name="clip" size={21} />
          </button>

          <label className="chat-composer__field">
            <span className="visually-hidden">Type a message</span>
            <textarea
              rows="1"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isRecording ? `Recording voice note… ${formatDuration(recordingSeconds)}` : "Message"}
              disabled={isRecording}
            />
          </label>

          {draft.trim() ? (
            <button type="button" className="chat-composer__action chat-composer__send" onClick={sendMessage} aria-label="Send message">
              <ChatIcon name="send" size={21} />
            </button>
          ) : (
            <button
              type="button"
              className={`chat-composer__action chat-composer__voice${isRecording ? " is-active" : ""}`}
              onClick={toggleRecording}
              aria-label={isRecording ? "Stop and send voice note" : "Record voice note"}
              title={isRecording ? "Stop and send" : "Record voice note"}
            >
              {isRecording ? <span className="chat-recording-stop" aria-hidden="true" /> : <ChatIcon name="mic" size={21} />}
            </button>
          )}
        </div>
      </footer>
    </section>
  );
}
