"use client";

import DOMPurify from "dompurify";
import { marked } from "marked";

function looksLikeHTML(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

marked.setOptions({ breaks: true });

export function RichText({ value }: { value: string }) {
  if (!value?.trim()) return null;

  let html: string;
  if (looksLikeHTML(value)) {
    html = DOMPurify.sanitize(value, {
      USE_PROFILES: { html: true },
      ADD_ATTR: ["target", "rel"],
    });
  } else {
    const raw = marked.parse(value, { async: false }) as string;
    html = DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
  }

  return (
    <div
      className="rich-text text-sm leading-relaxed"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
