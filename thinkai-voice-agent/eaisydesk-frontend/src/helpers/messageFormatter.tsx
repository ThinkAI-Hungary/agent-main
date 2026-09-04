import React, { useState } from 'react';

/**
 * Shorten long URLs for clean UI display
 */
function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    const path = u.pathname;
    if (path.length > 25) {
      return `${host}${path.slice(0, 18)}…`;
    }
    return `${host}${path}`;
  } catch {
    return url.length > 40 ? url.slice(0, 37) + '…' : url;
  }
}

function isImageExtension(str: string): boolean {
  return /\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(str);
}

/**
 * Parses inline formatting:
 * - [image: filename.ext](url) or [image: filename.ext] -> styled tag or link
 * - [Melléklet: filename.ext](url) -> styled download tag
 * - <https://...> or https://... -> clickable <a>
 * - <email@domain> -> clickable mailto: <a>
 * - **bold** or *bold* -> <strong>
 */
export function formatInlineText(text: string): React.ReactNode[] {
  if (!text) return [];

  const tokenRegex =
    /(\[(?:image|kép|melléklet|csatolt\s*fájl):\s*[^\]]+\](?:\([^\)]+\))?|<https?:\/\/[^>]+>|https?:\/\/[^\s<>]+|<[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}>|\*{1,2}[^*\n]+\*{1,2})/gi;

  const parts = text.split(tokenRegex);

  return parts.map((part, i) => {
    if (!part) return null;

    // Image / Attachment marker: [image: name](url) or [image: name]
    const imgMatch = part.match(
      /^\[(?:image|kép|melléklet|csatolt\s*fájl):\s*([^\]]+)\](?:\(([^)]+)\))?$/i
    );
    if (imgMatch) {
      const fileName = imgMatch[1].trim();
      const fileUrl = imgMatch[2] ? imgMatch[2].trim() : '';

      const content = (
        <span key={i} className="ism-attachment-tag">
          <svg
            className="ism-attachment-tag-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            width="14"
            height="14"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <span className="ism-attachment-tag-name">{fileName}</span>
        </span>
      );

      if (fileUrl) {
        return (
          <a
            key={i}
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ism-attachment-tag-link"
            title={`${fileName} megnyitása`}
          >
            {content}
          </a>
        );
      }
      return content;
    }

    // Link: <https://...>
    if (part.startsWith('<http') && part.endsWith('>')) {
      const url = part.slice(1, -1);
      return (
        <a
          key={i}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="ism-chat-link"
          title={url}
        >
          {shortenUrl(url)}
        </a>
      );
    }

    // Plain URL: https://...
    if (/^https?:\/\//i.test(part)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="ism-chat-link"
          title={part}
        >
          {shortenUrl(part)}
        </a>
      );
    }

    // Email address in brackets: <email@domain.com>
    const emailMatch = part.match(
      /^<([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>$/
    );
    if (emailMatch) {
      const email = emailMatch[1];
      return (
        <a
          key={i}
          href={`mailto:${email}`}
          className="ism-chat-link ism-chat-link--email"
        >
          &lt;{email}&gt;
        </a>
      );
    }

    // Bold text: **bold** or *bold*
    const boldMatch = part.match(/^\*{1,2}([^*\n]+)\*{1,2}$/);
    if (boldMatch) {
      const boldText = boldMatch[1].trim();
      return (
        <strong key={i} className="ism-chat-bold">
          {boldText}
        </strong>
      );
    }

    return part;
  });
}

/**
 * Formatted message renderer for chat bubbles and interaction details
 */
export function FormattedMessage({ text }: { text: string }) {
  const [lightboxImg, setLightboxImg] = useState<{ url: string; title: string } | null>(null);

  if (!text) return null;

  const lines = text.split('\n');

  return (
    <div className="ism-formatted-text">
      {lines.map((line, idx) => {
        const trimmed = line.trim();

        // 1. Standalone image / attachment line (e.g. "[image: image.png]" or "[image: image.png](/api/attachments/...)")
        const attMatch = trimmed.match(
          /^\[(?:image|kép|melléklet|csatolt\s*fájl):\s*([^\]]+)\](?:\(([^)]+)\))?$/i
        );
        if (attMatch) {
          const fileName = attMatch[1].trim();
          const fileUrl = attMatch[2] ? attMatch[2].trim() : '';
          const isImage = isImageExtension(fileName) || (fileUrl ? isImageExtension(fileUrl) : false);

          // If it's an image with an accessible URL -> render image card with preview thumbnail
          if (isImage && fileUrl) {
            return (
              <div key={idx} className="ism-attachment-card ism-attachment-card--image">
                <div
                  className="ism-attachment-img-wrap"
                  onClick={() => setLightboxImg({ url: fileUrl, title: fileName })}
                  title="Kattints a nagyításhoz"
                >
                  <img
                    src={fileUrl}
                    alt={fileName}
                    className="ism-attachment-img"
                    loading="lazy"
                  />
                  <div className="ism-attachment-overlay">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      <line x1="11" y1="8" x2="11" y2="14" />
                      <line x1="8" y1="11" x2="14" y2="11" />
                    </svg>
                    <span>Nagyítás</span>
                  </div>
                </div>
                <div className="ism-attachment-card-footer">
                  <span className="ism-attachment-filename" title={fileName}>{fileName}</span>
                  <a
                    href={fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ism-attachment-link-btn"
                    title="Megnyitás új lapon"
                  >
                    Megnyitás ↗
                  </a>
                </div>
              </div>
            );
          }

          // Non-image document or legacy image placeholder without URL
          return (
            <div key={idx} className="ism-attachment-chip">
              <svg
                className="ism-attachment-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                width="18"
                height="18"
              >
                {isImage ? (
                  <>
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </>
                ) : (
                  <>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </>
                )}
              </svg>
              <div className="ism-attachment-chip-body">
                <span className="ism-attachment-label">
                  {isImage ? 'Csatolt kép / beágyazott tartalom' : 'Csatolt dokumentum'}
                </span>
                <span className="ism-attachment-filename">{fileName}</span>
              </div>
              {fileUrl && (
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                  className="ism-attachment-download-btn"
                  title={`${fileName} letöltése`}
                >
                  Letöltés ↓
                </a>
              )}
            </div>
          );
        }

        // 2. Forwarded message divider (e.g. "--------- Forwarded message ---------")
        if (
          /^[-–]{3,}\s*(Forwarded message|Továbbított üzenet)\s*[-–]{3,}$/i.test(
            trimmed
          )
        ) {
          return (
            <div key={idx} className="ism-forwarded-divider">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                width="13"
                height="13"
              >
                <polyline points="15 17 20 12 15 7" />
                <path d="M4 18v-2a4 4 0 0 1 4-4h12" />
              </svg>
              <span>{trimmed.replace(/[-–]/g, '').trim()}</span>
            </div>
          );
        }

        // 3. Quoted email lines (starting with ">")
        const isQuote = trimmed.startsWith('>');
        const lineContent = isQuote ? trimmed.replace(/^>\s*/, '') : line;

        const formatted = formatInlineText(lineContent);

        if (isQuote) {
          return (
            <div key={idx} className="ism-quote-line">
              {formatted}
            </div>
          );
        }

        // 4. Empty line
        if (!trimmed) {
          return <div key={idx} className="ism-empty-line" />;
        }

        return (
          <div key={idx} className="ism-text-line">
            {formatted}
          </div>
        );
      })}

      {/* Lightbox full-size image modal */}
      {lightboxImg && (
        <div
          className="ism-lightbox-backdrop"
          onClick={() => setLightboxImg(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="ism-lightbox-container" onClick={(e) => e.stopPropagation()}>
            <button
              className="ism-lightbox-close"
              onClick={() => setLightboxImg(null)}
              aria-label="Bezárás"
            >
              ✕
            </button>
            <img
              src={lightboxImg.url}
              alt={lightboxImg.title}
              className="ism-lightbox-img"
            />
            <div className="ism-lightbox-toolbar">
              <span className="ism-lightbox-title">{lightboxImg.title}</span>
              <a
                href={lightboxImg.url}
                target="_blank"
                rel="noopener noreferrer"
                className="ism-lightbox-open"
              >
                Eredeti megnyitása új lapon ↗
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
