import { useEffect, useRef } from "react";
import { useOnlineStatus } from "./useOnlineStatus";

export const RECONNECT_EVENT = "offline:reconnect" as const;

export function useReconnect(onReconnect?: () => void): void {
  const isOnline = useOnlineStatus();
  const wasOnlineRef = useRef(isOnline);

  useEffect(() => {
    const previous = wasOnlineRef.current;
    wasOnlineRef.current = isOnline;

    if (!previous && isOnline) {
      window.dispatchEvent(new CustomEvent(RECONNECT_EVENT));
      onReconnect?.();
    }
  }, [isOnline, onReconnect]);
}
