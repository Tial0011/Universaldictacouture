import ChatIcon from "./ChatIcon";

export default function ConversationList({ threads, activeId, onSelect, search, onSearchChange }) {
  return (
    <aside className="chat-list" aria-label="Conversations">
      <div className="chat-list__heading">
        <p className="chat-list__eyebrow">Private assistance</p>
        <h1>Chats</h1>
        <p>One place for guidance and order conversations with your Dicta Couturier.</p>
      </div>

      <label className="chat-list__search">
        <span className="visually-hidden">Search conversations</span>
        <ChatIcon name="search" size={18} />
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search conversations"
        />
      </label>

      <div className="chat-list__items">
        {threads.length ? threads.map((thread) => {
          const active = thread.id === activeId;
          return (
            <button
              key={thread.id}
              type="button"
              className={`chat-list__item${active ? " is-active" : ""}`}
              onClick={() => onSelect(thread.id)}
              aria-current={active ? "page" : undefined}
            >
              <span className="chat-avatar chat-avatar--small" aria-hidden="true">DC</span>
              <span className="chat-list__item-copy">
                <span className="chat-list__row">
                  <strong>{thread.title}</strong>
                  <time>{thread.lastActivity}</time>
                </span>
                <span className="chat-list__meta">
                  <span className={`chat-kind chat-kind--${thread.kind}`}>{thread.label}</span>
                  {thread.orderNumber ? <span>{thread.orderNumber}</span> : null}
                </span>
                <span className="chat-list__preview">{thread.lastMessage}</span>
              </span>
              {thread.unread ? <span className="chat-list__unread" aria-label={`${thread.unread} unread messages`}>{thread.unread}</span> : null}
            </button>
          );
        }) : (
          <div className="chat-list__empty">
            <p>No conversations match your search.</p>
          </div>
        )}
      </div>
    </aside>
  );
}
