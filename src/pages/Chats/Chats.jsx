import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ConversationList from "../../components/chat/ConversationList";
import ChatWindow from "../../components/chat/ChatWindow";
import { MOCK_THREADS } from "../../components/chat/mockChatData";
import "./Chats.css";

export default function Chats() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedThread = searchParams.get("thread");
  const initialId = MOCK_THREADS.some((thread) => thread.id === requestedThread) ? requestedThread : MOCK_THREADS[0].id;
  const [activeId, setActiveId] = useState(initialId);
  const [search, setSearch] = useState("");
  const [mobileView, setMobileView] = useState(requestedThread ? "chat" : "list");

  useEffect(() => {
    if (requestedThread && MOCK_THREADS.some((thread) => thread.id === requestedThread)) {
      setActiveId(requestedThread);
      setMobileView("chat");
    }
  }, [requestedThread]);

  const filteredThreads = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return MOCK_THREADS;
    return MOCK_THREADS.filter((thread) => [
      thread.title,
      thread.orderNumber,
      thread.status,
      thread.lastMessage,
      thread.label,
    ].filter(Boolean).some((value) => value.toLowerCase().includes(query)));
  }, [search]);

  const activeThread = MOCK_THREADS.find((thread) => thread.id === activeId) || MOCK_THREADS[0];

  const selectThread = (threadId) => {
    setActiveId(threadId);
    setMobileView("chat");
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("thread", threadId);
      return next;
    }, { replace: true });
  };

  return (
    <div className={`chats-page chats-page--mobile-${mobileView}`}>
      <div className="chats-shell">
        <ConversationList
          threads={filteredThreads}
          activeId={activeId}
          onSelect={selectThread}
          search={search}
          onSearchChange={setSearch}
        />
        <ChatWindow thread={activeThread} onMobileBack={() => setMobileView("list")} />
      </div>
    </div>
  );
}
