import { useEffect } from "react";

const STYLE_ID = "timeplete-landing-scroll";

/**
 * Expo web sets `body { overflow: hidden }` and `#root { height: 100% }` for app
 * screens. The marketing landing page is a long document and must scroll inside
 * its own root container instead of relying on document scroll.
 */
export function useLandingPageScrollContainer() {
  useEffect(() => {
    if (typeof document === "undefined") return;

    let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = `
        .landing-root {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          overflow-y: auto;
          overflow-x: hidden;
          -webkit-overflow-scrolling: touch;
        }
      `;
      document.head.appendChild(style);
    }

    return () => {
      document.getElementById(STYLE_ID)?.remove();
    };
  }, []);
}

export function useLandingSectionObserver(
  rootRef: React.RefObject<HTMLDivElement | null>,
) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;

    const hero = root.querySelector("#hero");
    hero?.classList.add("landing-visible");

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("landing-visible");
          }
        }
      },
      {
        root,
        rootMargin: "0px 0px -80px 0px",
        threshold: 0.1,
      },
    );

    root.querySelectorAll(".landing-section").forEach((node) => {
      observer.observe(node);
    });

    return () => observer.disconnect();
  }, [rootRef]);
}
