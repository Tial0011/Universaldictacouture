import { useEffect, useMemo, useRef, useState } from "react";
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

      <button type="button" className="chat-order-card__cta">View Order Card <span aria-hidden="true">→</span></button>
      <p className="chat-order-card__note">Mockup state only — live order actions will connect when the transaction backend is built.</p>
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

function MessageBubble({ message, onRetry }) {
  if (message.type === "system") {
    return <div className="chat-system-event"><ChatIcon name="pin" size={15} /><span>{message.text}</span></div>;
  }
  if (message.type === "context") return <ContextCard message={message} />;
  if (message.type === "orderCard") return <CompactOrderCard message={message} />;
  if (message.type === "media") return <MediaMessage message={message} />;

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

export default function ChatWindow({ thread, onMobileBack }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [localMessages, setLocalMessages] = useState([]);
  const [pinOpen, setPinOpen] = useState(true);
  const viewportRef = useRef(null);

  useEffect(() => {
    setLocalMessages([]);
    setDraft("");
    setMenuOpen(false);
    setPinOpen(true);
  }, [thread.id]);

  useEffect(() => {
    if (!localMessages.length) return;
    viewportRef.current?.scrollTo({ top: viewportRef.current.scrollHeight, behavior: "smooth" });
  }, [localMessages]);

  const sendMessage = () => {
    const text = draft.trim();
    if (!text) return;
    const id = `local-${Date.now()}`;
    const now = new Intl.DateTimeFormat("en-NG", { hour: "numeric", minute: "2-digit" }).format(new Date());
    setLocalMessages((messages) => [...messages, { id, type: "customer", text, time: now, state: "pending" }]);
    setDraft("");
    window.setTimeout(() => {
      setLocalMessages((messages) => messages.map((message) => message.id === id ? { ...message, state: "sent" } : message));
    }, 450);
  };

  const retryMessage = (messageId) => {
    setLocalMessages((messages) => messages.map((message) => message.id === messageId ? { ...message, state: "pending" } : message));
    window.setTimeout(() => {
      setLocalMessages((messages) => messages.map((message) => message.id === messageId ? { ...message, state: "sent" } : message));
    }, 450);
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
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
              <button type="button">View current Order Card <span aria-hidden="true">→</span></button>
            </div>
          ) : null}
        </div>
      ) : thread.context ? (
        <div className="chat-context-strip">
          <ChatIcon name={thread.context.type === "review" ? "review" : "product"} size={18} />
          <span><strong>{thread.context.title}</strong><small>{thread.context.meta}</small></span>
          <button type="button" aria-label="Dismiss context"><ChatIcon name="close" size={16} /></button>
        </div>
      ) : null}

      <div className="chat-window__messages" ref={viewportRef}>
        <div className="chat-day-label"><span>Today</span></div>
        {[...thread.messages, ...localMessages].map((message) => (
          <MessageBubble key={message.id} message={message} onRetry={retryMessage} />
        ))}
      </div>

      <footer className="chat-composer">
        <div className="chat-composer__tools" aria-label="Attachment tools">
          <button type="button" aria-label="Add image" title="Frontend mockup"><ChatIcon name="image" size={21} /></button>
          <button type="button" aria-label="Add attachment" title="Frontend mockup"><ChatIcon name="clip" size={21} /></button>
          <button type="button" className="chat-composer__voice" aria-label="Voice note" title="Frontend mockup"><ChatIcon name="mic" size={21} /></button>
        </div>
        <label className="chat-composer__field">
          <span className="visually-hidden">Type a message</span>
          <textarea
            rows="1"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message…"
          />
        </label>
        <button type="button" className="chat-composer__send" onClick={sendMessage} disabled={!draft.trim()} aria-label="Send message">
          <ChatIcon name="send" size={22} />
        </button>
      </footer>
    </section>
  );
}
