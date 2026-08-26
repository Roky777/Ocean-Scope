import { useEffect, useState } from "react";

/**
 * Keeps a panel mounted briefly after it closes so its exit animation can
 * play. Returns [valueToRender, isClosing].
 *
 * React unmounts on `{x && <Panel/>}` immediately, which makes close feel
 * abrupt next to an animated open.
 */
export function useClosable(value, ms = 220) {
  const [shown, setShown] = useState(value);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (value) {
      setShown(value);
      setClosing(false);
      return;
    }
    setClosing((wasClosing) => {
      if (wasClosing) return wasClosing;
      return true;
    });
    const t = setTimeout(() => {
      setShown(null);
      setClosing(false);
    }, ms);
    return () => clearTimeout(t);
  }, [value, ms]);

  return [shown, closing];
}
