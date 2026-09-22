import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { formatNaira } from "../../utils/formatters";
import {
  MOCK_CLOSET_PIECES,
  MOCK_ORDERS,
  MOCK_PAYMENTS,
} from "../../components/closet/mockClosetData";
import "./MyCloset.css";

function Icon({ name, size = 20 }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };

  const paths = {
    check: <path d="m5 12 4 4L19 6" />,
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.9-8.6a5.5 5.5 0 0 0-.1-7.8Z" />,
    share: <><circle cx="18" cy="5" r="2.2" /><circle cx="6" cy="12" r="2.2" /><circle cx="18" cy="19" r="2.2" /><path d="m8 11 7.8-4.7M8 13l7.8 4.7" /></>,
    arrow: <><path d="M5 12h14" /><path d="m14 7 5 5-5 5" /></>,
    close: <><path d="m6 6 12 12" /><path d="m18 6-12 12" /></>,
    clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v5l3 2" /></>,
    chat: <path d="M5 17.5 3.5 21l4.4-1.4a9 9 0 1 0-2.9-2.1Z" />,
    receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>,
    sparkle: <><path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2Z" /><path d="m18.5 14 .7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7Z" /></>,
    lock: <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  };

  return <svg {...common}>{paths[name]}</svg>;
}

const TABS = [
  { id: "pieces", label: "My Pieces" },
  { id: "orders", label: "Orders" },
  { id: "payments", label: "Payments" },
];

function PieceRow({ piece, selected, onSelect, saved, onToggleSaved, onShare }) {
  return (
    <article className={`closet-piece${selected ? " is-selected" : ""}${!piece.available ? " is-unavailable" : ""}`}>
      <button
        type="button"
        className="closet-piece__select"
        aria-label={selected ? `Deselect ${piece.name}` : `Select ${piece.name}`}
        aria-pressed={selected}
        disabled={!piece.available}
        onClick={() => onSelect(piece.id)}
      >
        {selected ? <Icon name="check" size={15} /> : null}
      </button>

      <img className="closet-piece__image" src={piece.image} alt="" />

      <div className="closet-piece__main">
        <div className="closet-piece__title-row">
          <h3>{piece.name}</h3>
          <button
            type="button"
            className={`closet-piece__heart${saved ? " is-saved" : ""}`}
            aria-label={saved ? `Remove ${piece.name} from My Closet` : `Save ${piece.name} to My Closet`}
            aria-pressed={saved}
            onClick={() => onToggleSaved(piece.id)}
          >
            <Icon name="heart" size={20} />
          </button>
        </div>

        <strong className="closet-piece__price">{formatNaira(piece.price)}</strong>
        <p className="closet-piece__meta">{piece.meta}</p>

        {!piece.available ? (
          <span className="closet-piece__unavailable">Temporarily unavailable</span>
        ) : piece.completedOrders > 0 ? (
          <span className="closet-piece__history">
            {piece.completedOrders} completed {piece.completedOrders === 1 ? "order" : "orders"}
          </span>
        ) : null}

        <div className="closet-piece__actions">
          <button type="button" onClick={() => onShare(piece)}>
            <Icon name="share" size={17} />
            Share
          </button>
          {piece.available ? (
            <Link to="/shop" aria-label={`View ${piece.name} in Product Details`}>
              View Piece <Icon name="arrow" size={16} />
            </Link>
          ) : (
            <span className="closet-piece__disabled-action">View Piece unavailable</span>
          )}
        </div>
      </div>
    </article>
  );
}

function MyPieces({ onOpenReview }) {
  const [pieces, setPieces] = useState(MOCK_CLOSET_PIECES);
  const [selectedIds, setSelectedIds] = useState([]);
  const [savedIds, setSavedIds] = useState(() => new Set(MOCK_CLOSET_PIECES.map((piece) => piece.id)));
  const [feedback, setFeedback] = useState("");

  const selectedPieces = useMemo(
    () => pieces.filter((piece) => selectedIds.includes(piece.id)),
    [pieces, selectedIds]
  );

  const toggleSelection = (pieceId) => {
    setSelectedIds((current) => current.includes(pieceId)
      ? current.filter((id) => id !== pieceId)
      : [...current, pieceId]);
  };

  const toggleSaved = (pieceId) => {
    setSavedIds((current) => {
      const next = new Set(current);
      if (next.has(pieceId)) {
        next.delete(pieceId);
        setFeedback("Removed from My Closet. Mock frontend only.");
      } else {
        next.add(pieceId);
        setFeedback("Added to My Closet. Mock frontend only.");
      }
      return next;
    });
  };

  const sharePiece = async (piece) => {
    const shareData = { title: piece.name, text: `Take a look at ${piece.name} from Universal Dicta Couture.` };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        setFeedback("Share sheet opened.");
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(window.location.origin + "/shop");
        setFeedback("Product link copied.");
      } else {
        setFeedback("Copy Link fallback will be connected during implementation.");
      }
    } catch {
      // Native share can be cancelled; no error state is necessary for a mock preview.
    }
  };

  return (
    <>
      {feedback ? (
        <div className="closet-feedback" role="status">
          <span>{feedback}</span>
          <button type="button" aria-label="Dismiss message" onClick={() => setFeedback("")}><Icon name="close" size={16} /></button>
        </div>
      ) : null}

      {pieces.length === 0 ? (
        <section className="closet-empty">
          <span className="closet-empty__mark"><Icon name="sparkle" size={30} /></span>
          <p className="closet-eyebrow">Your Private Dressing Room</p>
          <h2>Your rail is ready for the pieces you love.</h2>
          <p>My Closet keeps fabrics you want to return to, without turning them into a cart or a purchase commitment.</p>
          <div className="closet-empty__actions">
            <Link className="closet-button closet-button--primary" to="/shop">Add More Pieces <Icon name="arrow" size={17} /></Link>
            <Link className="closet-button closet-button--secondary" to="/custom-style">Start Custom Style <Icon name="arrow" size={17} /></Link>
          </div>
        </section>
      ) : (
        <div className="closet-pieces-grid">
          {pieces.map((piece) => (
            <PieceRow
              key={piece.id}
              piece={piece}
              selected={selectedIds.includes(piece.id)}
              saved={savedIds.has(piece.id)}
              onSelect={toggleSelection}
              onToggleSaved={toggleSaved}
              onShare={sharePiece}
            />
          ))}
        </div>
      )}

      {selectedPieces.length > 0 ? (
        <aside className="closet-selection-bar" aria-label="Selected pieces">
          <div className="closet-selection-bar__summary">
            <div className="closet-selection-bar__thumbs" aria-hidden="true">
              {selectedPieces.slice(0, 3).map((piece) => <img key={piece.id} src={piece.image} alt="" />)}
            </div>
            <div>
              <strong>{selectedPieces.length} {selectedPieces.length === 1 ? "piece" : "pieces"} selected</strong>
              <span>Keep your fabrics saved while you prepare a structured review.</span>
            </div>
          </div>
          <div className="closet-selection-bar__actions">
            <button type="button" className="closet-selection-clear" onClick={() => setSelectedIds([])}>Clear</button>
            <button type="button" className="closet-selection-review" onClick={() => onOpenReview(selectedPieces)}>
              Review Selected Pieces <Icon name="arrow" size={18} />
            </button>
          </div>
        </aside>
      ) : null}
    </>
  );
}

function OrderDetail({ order }) {
  const chatThread = `order-${order.id}`;
  const [section, setSection] = useState("editions");

  return (
    <div className="closet-order-detail">
      <div className="closet-order-detail__summary">
        <img src={order.image} alt="" />
        <div>
          <span>{order.currentEdition} · Current</span>
          <strong>{formatNaira(order.total)}</strong>
          <small>{order.summary}</small>
        </div>
        <Link to={`/chats?thread=${encodeURIComponent(chatThread)}`} className="closet-inline-link">Open in Chat <Icon name="chat" size={16} /></Link>
      </div>

      <div className="closet-order-detail__switch" role="tablist" aria-label={`${order.title} history`}>
        <button type="button" role="tab" aria-selected={section === "editions"} onClick={() => setSection("editions")}>Editions</button>
        <button type="button" role="tab" aria-selected={section === "activity"} onClick={() => setSection("activity")}>Activity / Timeline</button>
      </div>

      {section === "editions" ? (
        <div className="closet-history-list">
          {order.editions.map((edition) => (
            <div className="closet-history-row" key={edition.id}>
              <span className="closet-history-row__icon"><Icon name="history" size={18} /></span>
              <div>
                <strong>{edition.label}</strong>
                <span>{edition.state}</span>
                <small>{edition.actor} · {edition.time}</small>
              </div>
              <Link to={`/chats?thread=${encodeURIComponent(chatThread)}&focus=${encodeURIComponent(edition.id)}`}>See in Chat <Icon name="arrow" size={15} /></Link>
            </div>
          ))}
        </div>
      ) : (
        <div className="closet-timeline">
          {order.activity.map((event, index) => (
            <div className="closet-timeline__event" key={`${event.label}-${index}`}>
              <span aria-hidden="true" />
              <div><strong>{event.label}</strong><small>{event.meta}</small></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OrdersTab({ requestedOrder }) {
  const [openId, setOpenId] = useState(requestedOrder || MOCK_ORDERS[0].id);

  useEffect(() => {
    if (requestedOrder && MOCK_ORDERS.some((order) => order.id === requestedOrder)) setOpenId(requestedOrder);
  }, [requestedOrder]);

  return (
    <div className="closet-records">
      <div className="closet-section-heading">
        <div>
          <p className="closet-eyebrow">Order Access & History</p>
          <h2>Your Main Orders</h2>
        </div>
        <p>My Closet keeps your order history easy to find. Live editing, approvals and payments continue inside the relevant Chat.</p>
      </div>

      <div className="closet-order-list">
        {MOCK_ORDERS.map((order) => {
          const open = order.id === openId;
          return (
            <article className={`closet-order-card${open ? " is-open" : ""}`} key={order.id}>
              <button
                type="button"
                className="closet-order-card__header"
                aria-expanded={open}
                onClick={() => setOpenId(open ? "" : order.id)}
              >
                <img src={order.image} alt="" />
                <div className="closet-order-card__identity">
                  <span>{order.orderNumber}</span>
                  <h3>{order.title}</h3>
                  <p>{order.summary}</p>
                </div>
                <div className="closet-order-card__meta">
                  <span className={`closet-status closet-status--${order.tone}`}>{order.status}</span>
                  <small>Updated {order.updated}</small>
                  <strong>{open ? "Hide History" : "View Order"} <Icon name="arrow" size={15} /></strong>
                </div>
              </button>
              {open ? <OrderDetail order={order} /> : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function PaymentsTab() {
  const [openId, setOpenId] = useState(MOCK_PAYMENTS[0].id);

  return (
    <div className="closet-records">
      <div className="closet-section-heading">
        <div>
          <p className="closet-eyebrow">Bank-Transfer Ledger</p>
          <h2>Payments</h2>
        </div>
        <p>This is your payment access and history view. Payment Records stay attached to their Main Order; transaction actions continue in Chat.</p>
      </div>

      <div className="closet-payment-list">
        {MOCK_PAYMENTS.map((payment) => {
          const open = openId === payment.id;
          return (
            <article className={`closet-payment-card${open ? " is-open" : ""}`} key={payment.id}>
              <button type="button" className="closet-payment-card__header" aria-expanded={open} onClick={() => setOpenId(open ? "" : payment.id)}>
                <img src={payment.image} alt="" />
                <div>
                  <span>{payment.orderNumber}</span>
                  <h3>{payment.title}</h3>
                </div>
                <div className="closet-payment-card__summary">
                  <span>Amount Due Now<strong>{payment.amountDueNow ? formatNaira(payment.amountDueNow) : "—"}</strong></span>
                  <span>Total Paid<strong>{formatNaira(payment.totalPaid)}</strong></span>
                  <span>Outstanding<strong>{formatNaira(payment.outstanding)}</strong></span>
                </div>
              </button>

              {open ? (
                <div className="closet-payment-detail">
                  <div className="closet-payment-detail__note"><Icon name="lock" size={17} /> Payment Records are append-only mock history in this frontend preview.</div>
                  {payment.records.map((record) => (
                    <div className="closet-payment-row" key={record.id}>
                      <span className="closet-payment-row__icon"><Icon name="receipt" size={18} /></span>
                      <div>
                        <strong>{record.label}</strong>
                        <span>{formatNaira(record.amount)}</span>
                        <small>{record.time}</small>
                      </div>
                      <span className={`closet-payment-state closet-payment-state--${record.state.toLowerCase().replaceAll(" ", "-")}`}>{record.state}</span>
                      <Link to={`/chats?thread=${encodeURIComponent(`order-${payment.orderId}`)}&focus=${encodeURIComponent(record.id)}`}>See in Chat <Icon name="arrow" size={15} /></Link>
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function ReviewSelectedModal({ pieces, onClose }) {
  if (!pieces?.length) return null;
  return (
    <div className="closet-modal" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && onClose()}>
      <section className="closet-modal__panel" role="dialog" aria-modal="true" aria-labelledby="closet-review-title">
        <button type="button" className="closet-modal__close" aria-label="Close review preview" onClick={onClose}><Icon name="close" /></button>
        <p className="closet-eyebrow">Frontend Mockup</p>
        <h2 id="closet-review-title">Review Selected Pieces</h2>
        <p className="closet-modal__lead">This preview represents the structured multi-piece context Section 7 prepares before the Couturier flow. No order or payment is created here.</p>
        <div className="closet-modal__pieces">
          {pieces.map((piece, index) => (
            <div key={piece.id}>
              <img src={piece.image} alt="" />
              <span>{index + 1}</span>
              <div><strong>{piece.name}</strong><small>{formatNaira(piece.price)} · current public price context</small></div>
            </div>
          ))}
        </div>
        <div className="closet-modal__context">
          <strong>Structured context preserved</strong>
          <span>Stable product references · selected-item order · current product identity · price context · service availability placeholder · customer/session ownership placeholder.</span>
        </div>
        <div className="closet-modal__actions">
          <button type="button" className="closet-button closet-button--secondary" onClick={onClose}>Back to My Closet</button>
          <Link className="closet-button closet-button--primary" to="/chats?thread=closet-review">Continue with a Couturier <Icon name="arrow" size={17} /></Link>
        </div>
      </section>
    </div>
  );
}

export default function MyCloset() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const requestedOrder = searchParams.get("order");
  const safeTab = TABS.some((tab) => tab.id === requestedTab) ? requestedTab : "pieces";
  const [activeTab, setActiveTab] = useState(safeTab);
  const [reviewPieces, setReviewPieces] = useState([]);

  useEffect(() => {
    setActiveTab(safeTab);
  }, [safeTab]);

  const selectTab = (tabId) => {
    setActiveTab(tabId);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("tab", tabId);
      if (tabId !== "orders") next.delete("order");
      return next;
    }, { replace: true });
  };

  return (
    <div className="my-closet-page">
      <section className="closet-intro">
        <div className="closet-container closet-intro__inner">
          <div>
            <p className="closet-eyebrow">Your Private Dressing Room</p>
            <h1>My Closet</h1>
            <p>Keep the fabrics you love close, revisit your Main Orders, and follow payment history in one calm private space.</p>
          </div>
          <Link className="closet-button closet-button--primary closet-intro__cta" to="/shop">Add More Pieces <Icon name="arrow" size={18} /></Link>
        </div>
      </section>

      <div className="closet-container closet-workspace">
        <div className="closet-tabs" role="tablist" aria-label="My Closet sections">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              id={`closet-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`closet-panel-${tab.id}`}
              onClick={() => selectTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <section id={`closet-panel-${activeTab}`} role="tabpanel" aria-labelledby={`closet-tab-${activeTab}`} className="closet-panel">
          {activeTab === "pieces" ? <MyPieces onOpenReview={setReviewPieces} /> : null}
          {activeTab === "orders" ? <OrdersTab requestedOrder={requestedOrder} /> : null}
          {activeTab === "payments" ? <PaymentsTab /> : null}
        </section>
      </div>

      <ReviewSelectedModal pieces={reviewPieces} onClose={() => setReviewPieces([])} />
    </div>
  );
}
