export default function ChatIcon({ name, size = 20, strokeWidth = 1.8, className = "" }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
    focusable: "false",
    className,
  };

  const icons = {
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></>,
    back: <><path d="m15 18-6-6 6-6" /></>,
    send: <><path d="m3.5 11.5 16-7-5.2 15-3.2-6.1-7.6-1.9Z" /><path d="m11.1 13.4 8.4-8.9" /></>,
    image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m5 17 4.5-4.5 3.2 3.2 2.2-2.2L19 17" /></>,
    clip: <><path d="m8 12.5 6.5-6.5a3.2 3.2 0 1 1 4.5 4.5l-8.2 8.2a4.7 4.7 0 0 1-6.6-6.6l8-8" /><path d="m9.5 14.5 6.8-6.8" /></>,
    mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v4M9 21h6" /></>,
    pin: <><path d="m8 3 8 8" /><path d="m15 2 7 7-4 1-4 4-1 4-7-7 4-1 4-4 1-4Z" /><path d="m9 15-6 6" /></>,
    order: <><path d="M6 3h9l3 3v15H6z" /><path d="M15 3v4h4M9 11h6M9 15h6" /></>,
    product: <><path d="m4 8 8-4 8 4-8 4-8-4Z" /><path d="m4 8v8l8 4 8-4V8M12 12v8" /></>,
    review: <><path d="M4 5h16v11H9l-5 4V5Z" /><path d="M8 9h8M8 12h5" /></>,
    history: <><path d="M4 5v5h5" /><path d="M5.2 10a7.5 7.5 0 1 0 2-4" /><path d="M12 8v4l3 2" /></>,
    gallery: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8" cy="10" r="1.4" /><path d="m5 17 5-5 3 3 2-2 4 4" /></>,
    timeline: <><path d="M7 4h10M7 12h10M7 20h10" /><circle cx="4" cy="4" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="20" r="1" fill="currentColor" stroke="none" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" /><path d="M10 19h4" /></>,
    copy: <><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
    reply: <><path d="m9 9-5 4 5 4" /><path d="M5 13h8a6 6 0 0 1 6 6" /></>,
    edit: <><path d="m4 20 4.2-1 10-10-3.2-3.2-10 10L4 20Z" /><path d="m13.8 7 3.2 3.2" /></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></>,
    check: <><path d="m5 12 4 4L19 6" /></>,
    retry: <><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 5v6h-6" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  };

  return <svg {...common}>{icons[name]}</svg>;
}
