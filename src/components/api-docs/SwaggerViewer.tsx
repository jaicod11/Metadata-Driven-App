// src/components/api-docs/SwaggerViewer.tsx
"use client";

import { useEffect, useRef, useState } from "react";

const SWAGGER_VERSION = "5.17.14";
const SWAGGER_CSS = `https://unpkg.com/swagger-ui-dist@${SWAGGER_VERSION}/swagger-ui.css`;
const SWAGGER_JS = `https://unpkg.com/swagger-ui-dist@${SWAGGER_VERSION}/swagger-ui-bundle.js`;

interface Props {
  /** Where the generated document lives, e.g. /api/openapi.json?appId=… */
  specUrl: string;
}

/**
 * Swagger UI, loaded from a CDN rather than bundled — it is a large dependency
 * for one documentation page, and nothing else in the app needs it.
 *
 * Requests carry the session cookie (same origin), so "Try it out" runs as the
 * signed-in user and answers exactly as the real API would.
 */
export function SwaggerViewer({ specUrl }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    let cancelled = false;

    const ensureStylesheet = () => {
      if (document.querySelector(`link[href="${SWAGGER_CSS}"]`)) return;
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = SWAGGER_CSS;
      document.head.appendChild(link);
    };

    const ensureScript = () =>
      new Promise<void>((resolve, reject) => {
        if ((window as any).SwaggerUIBundle) return resolve();

        const existing = document.querySelector<HTMLScriptElement>(
          `script[src="${SWAGGER_JS}"]`
        );
        if (existing) {
          existing.addEventListener("load", () => resolve());
          existing.addEventListener("error", () => reject(new Error("load failed")));
          return;
        }

        const script = document.createElement("script");
        script.src = SWAGGER_JS;
        script.crossOrigin = "anonymous";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("load failed"));
        document.body.appendChild(script);
      });

    ensureStylesheet();
    ensureScript()
      .then(() => {
        if (cancelled || !container.current) return;
        (window as any).SwaggerUIBundle({
          url: specUrl,
          domNode: container.current,
          docExpansion: "list",
          defaultModelsExpandDepth: 0,
          tryItOutEnabled: true,
          withCredentials: true,
        });
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("failed");
      });

    return () => {
      cancelled = true;
    };
  }, [specUrl]);

  return (
    <div>
      {status === "loading" && (
        <div className="p-6 text-sm text-gray-500">Loading API reference…</div>
      )}

      {status === "failed" && (
        <div className="m-6 p-4 rounded-lg border border-amber-300 bg-amber-50">
          <p className="text-sm font-medium text-amber-800">
            Could not load Swagger UI
          </p>
          <p className="text-xs text-amber-700 mt-1">
            It is served from a CDN, which this browser or network may be
            blocking. The document itself is unaffected — open{" "}
            <a href={specUrl} className="underline font-mono">
              {specUrl}
            </a>{" "}
            to read or download it.
          </p>
        </div>
      )}

      <div ref={container} />
    </div>
  );
}
