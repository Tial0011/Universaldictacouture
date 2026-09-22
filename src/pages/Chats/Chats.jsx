import { useMemo, useState } from "react";
import ConversationList from "../../components/chat/ConversationList";
import ChatWindow from "../../components/chat/ChatWindow";
import { MOCK_THREADS } from "../../components/chat/mockChatData";
import "./Chats.css";

export default function Chats() {
  const [activeId, setActiveId] = useState(MOCK_THREADS[0].id);
  const [search, setSearch] = useState("");
  const [mobileView, setMobileView] = useState("chat");

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
