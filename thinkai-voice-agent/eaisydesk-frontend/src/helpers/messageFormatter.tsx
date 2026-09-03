import React from 'react';

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

/**
 * Parses inline formatting:
 * - [image: filename.ext] -> styled image badge
 * - [Melléklet: filename.ext] -> styled attachment badge
 * - <https://...> or https://... -> clickable <a>
 * - <email@domain> -> clickable mailto: <a>
 * - **bold** or *bold* -> <strong>
 */
export function formatInlineText(text: string): React.ReactNode[] {
  if (!text) return [];

  const tokenRegex =
    /(\[(?:image|kép|melléklet|csatolt\s*fájl):\s*[^\]]+\]|<https?:\/\/[^>]+>|https?:\/\/[^\s<>]+|<[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}>|\*{1,2}[^*\n]+\*{1,2})/gi;

  const parts = text.split(tokenRegex);

  return parts.map((part, i) => {
    if (!part) return null;

    // Image / Attachment marker
    const imgMatch = part.match(
      /^\[(?:image|kép|melléklet|csatolt\s*fájl):\s*([^\]]+)\]$/i
    );
    if (imgMatch) {
      const fileName = imgMatch[1].trim();
      return (
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
  if (!text) return null;

  const lines = text.split('\n');

  return (
    <div className="ism-formatted-text">
      {lines.map((line, idx) => {
        const trimmed = line.trim();

        // 1. Standalone image / attachment line (e.g. "[image: image.png]")
        const imgMatch = trimmed.match(
          /^\[(?:image|kép|melléklet|csatolt\s*fájl):\s*([^\]]+)\]$/i
        );
        if (imgMatch) {
          const fileName = imgMatch[1].trim();
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
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              <div className="ism-attachment-chip-body">
                <span className="ism-attachment-label">
                  Csatolt kép / beágyazott tartalom
                </span>
                <span className="ism-attachment-filename">{fileName}</span>
              </div>
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
    </div>
  );
}
