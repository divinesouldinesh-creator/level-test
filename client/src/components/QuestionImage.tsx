import { useEffect, useState } from "react";
import { mediaUrl } from "../api";

export function QuestionImage({
  src,
  alt = "Question diagram",
  className = "mt-4 max-h-72 w-full object-contain rounded-xl border border-slate-100 bg-slate-50",
}: {
  src?: string | null;
  alt?: string;
  className?: string;
}) {
  const url = mediaUrl(src);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [url]);
  if (!url) return null;
  if (failed) {
    return (
      <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        Diagram could not be loaded. Refresh the page or ask a teacher to re-upload this image.
      </p>
    );
  }
  return <img src={url} alt={alt} className={className} onError={() => setFailed(true)} />;
}
