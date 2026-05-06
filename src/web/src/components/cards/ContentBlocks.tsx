import { useState } from "react";
import { classNames } from "../../utils.ts";

type TextBlock = { type: "text"; text: string };
type ImageBlock = {
  type: "image";
  source: { type: "base64"; media_type: string; data: string };
};
type ContentBlock = TextBlock | ImageBlock | Record<string, unknown>;

export function isContentBlockArray(value: unknown): value is ContentBlock[] {
  if (!Array.isArray(value)) return false;
  if (value.length === 0) return false;
  return value.every(
    (b) =>
      b !== null &&
      typeof b === "object" &&
      typeof (b as { type?: unknown }).type === "string",
  );
}

export function ContentBlocks({ blocks }: { blocks: unknown }) {
  if (!isContentBlockArray(blocks)) return null;
  return (
    <div className="space-y-2">
      {blocks.map((block, i) => {
        const b = block as ContentBlock;
        if (b.type === "text" && typeof (b as TextBlock).text === "string") {
          return <TextChunk key={i} text={(b as TextBlock).text} />;
        }
        if (
          b.type === "image" &&
          (b as ImageBlock).source?.type === "base64"
        ) {
          const src = b as ImageBlock;
          return (
            <ImageChunk
              key={i}
              mediaType={src.source.media_type}
              data={src.source.data}
            />
          );
        }
        return (
          <pre
            key={i}
            className="text-[12px] font-mono text-zinc-300 bg-zinc-950 border border-zinc-800 rounded p-3 max-h-60 overflow-auto whitespace-pre-wrap"
          >
            {JSON.stringify(b, null, 2)}
          </pre>
        );
      })}
    </div>
  );
}

function TextChunk({ text }: { text: string }) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  return (
    <pre className="text-[12px] font-mono text-zinc-200 bg-zinc-950/70 border border-zinc-800 rounded px-3 py-2 whitespace-pre-wrap break-words">
      {trimmed}
    </pre>
  );
}

function ImageChunk({
  mediaType,
  data,
}: {
  mediaType: string;
  data: string;
}) {
  const [zoom, setZoom] = useState(false);
  const url = `data:${mediaType};base64,${data}`;
  const sizeKb = Math.round((data.length * 3) / 4 / 1024);
  return (
    <>
      <button
        type="button"
        onClick={() => setZoom(true)}
        className="group relative block w-full overflow-hidden rounded-md border border-zinc-800 bg-zinc-950 hover:border-zinc-600 transition-colors"
      >
        <img
          src={url}
          alt="captured"
          className="w-full h-auto max-h-[480px] object-contain bg-black"
        />
        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-2.5 py-1 bg-gradient-to-t from-black/80 to-transparent text-[10px] font-mono text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity">
          <span>{mediaType}</span>
          <span>{sizeKb} kb · click to zoom</span>
        </div>
      </button>
      {zoom && (
        <div
          role="dialog"
          aria-label="Zoomed image"
          onClick={() => setZoom(false)}
          className={classNames(
            "fixed inset-0 z-50 flex items-center justify-center",
            "bg-black/90 backdrop-blur-sm cursor-zoom-out p-6",
          )}
        >
          <img
            src={url}
            alt="captured zoomed"
            className="max-w-full max-h-full object-contain shadow-2xl"
          />
        </div>
      )}
    </>
  );
}
