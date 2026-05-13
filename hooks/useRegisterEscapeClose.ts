import { useEffect, useRef } from "react";
import { registerDialogEscape } from "../lib/dialogEscapeCloseStack";

/**
 * On web, Escape dismisses this surface; nested surfaces register later and
 * close first. On native this is a no-op.
 */
export function useRegisterEscapeClose(
  onClose: () => void,
  enabled: boolean = true,
) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!enabled) return;
    return registerDialogEscape(() => onCloseRef.current());
  }, [enabled]);
}
