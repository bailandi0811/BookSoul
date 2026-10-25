import { useSyncExternalStore } from "react";
import { isCoverFlightAnimating, subscribeCoverFlight } from "./book-cover-flight";

export function useCoverFlightAnimating() {
  return useSyncExternalStore(subscribeCoverFlight, isCoverFlightAnimating, () => false);
}
