'use client';

import type { SyntheticEvent } from 'react';

export default function LandingPage() {
  const connectAppLink = (event: SyntheticEvent<HTMLIFrameElement>) => {
    const iframe = event.currentTarget;
    const doc = iframe.contentDocument;
    if (!doc) return;

    const injectScrollbarStyles = (targetDoc: Document) => {
      try {
        if (!targetDoc || targetDoc.getElementById('solorise-no-scrollbars')) return;
        const style = targetDoc.createElement('style');
        style.id = 'solorise-no-scrollbars';
        style.textContent = `
          * {
            scrollbar-width: none !important;
            -ms-overflow-style: none !important;
          }
          *::-webkit-scrollbar {
            display: none !important;
            width: 0 !important;
            height: 0 !important;
          }
        `;
        (targetDoc.head || targetDoc.documentElement).appendChild(style);
      } catch {}
    };

    injectScrollbarStyles(doc);

    try {
      const observer = new MutationObserver(() => {
        try {
          const currentDoc = iframe.contentDocument;
          if (currentDoc) {
            injectScrollbarStyles(currentDoc);
          }
        } catch {}
      });
      observer.observe(doc, { childList: true, subtree: true });
    } catch {}

    if (doc.documentElement.dataset.soloriseWired) return;
    doc.documentElement.dataset.soloriseWired = 'true';
    doc.addEventListener('click', (click) => {
      const target = click.target instanceof Element ? click.target.closest('a, button') : null;
      if (target?.textContent?.trim() !== 'Sign in') return;
      click.preventDefault();
      window.location.assign('/board');
    }, true);
  };

  return (
    <iframe
      title="Solorise — tickets for freelancers and independent teams"
      src="/solorise-landing.html"
      onLoad={connectAppLink}
      style={{ display: 'block', width: '100%', height: '100dvh', border: 0 }}
    />
  );
}
