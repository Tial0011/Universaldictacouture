import { createContext, useContext } from "react";
import { useCustomerSession } from "../hooks/useCustomerSession";
import { useBoundSaves } from "../hooks/useBoundSaves";
const unavailable = { savedReviewIds: [], isReviewSaved: () => false, toggleSavedReview: () => null, retrySync: () => {}, isPersistent: false, isReady: false, error: "" };
const SavedReviewsContext = createContext(unavailable);
export function SavedReviewsProvider({ children }) {
  const { user } = useCustomerSession();
  if (!user) return <SavedReviewsContext.Provider value={unavailable}>{children}</SavedReviewsContext.Provider>;
  return <BoundReviews key={user.uid + ':' + user.epoch} principalUid={user.principalUid}>{children}</BoundReviews>;
}
function BoundReviews({ principalUid, children }) {
  const state = useBoundSaves(principalUid, "review");
  return <SavedReviewsContext.Provider value={{ savedReviewIds: state.ids, isReviewSaved: id => state.ids.includes(id), toggleSavedReview: id => { void state.toggleConfirmed(id); return { added: !state.ids.includes(id) }; }, retrySync: state.retry, isPersistent: true, isReady: state.ready, error: state.error }}>{children}</SavedReviewsContext.Provider>;
}
export function useSavedReviews() { return useContext(SavedReviewsContext); }
