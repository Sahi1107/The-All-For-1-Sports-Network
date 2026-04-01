import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  urls: string[];
  alt?: string;
  className?: string;
}

export default function ImageCarousel({ urls, alt = '', className = '' }: Props) {
  const [idx, setIdx] = useState(0);

  if (urls.length === 0) return null;
  if (urls.length === 1) {
    return <img src={urls[0]} alt={alt} className={`w-full max-h-[28rem] object-cover ${className}`} />;
  }

  const prev = () => setIdx((i) => (i === 0 ? urls.length - 1 : i - 1));
  const next = () => setIdx((i) => (i === urls.length - 1 ? 0 : i + 1));

  return (
    <div className={`relative group ${className}`}>
      <img
        src={urls[idx]}
        alt={`${alt} ${idx + 1}`}
        className="w-full max-h-[28rem] object-cover transition-opacity duration-200"
      />

      {/* Left arrow */}
      <button
        onClick={prev}
        className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <ChevronLeft size={18} />
      </button>

      {/* Right arrow */}
      <button
        onClick={next}
        className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <ChevronRight size={18} />
      </button>

      {/* Dot indicators */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
        {urls.map((_, i) => (
          <button
            key={i}
            onClick={() => setIdx(i)}
            className={`w-1.5 h-1.5 rounded-full transition-all ${
              i === idx ? 'bg-white w-3' : 'bg-white/50'
            }`}
          />
        ))}
      </div>

      {/* Counter badge */}
      <span className="absolute top-3 right-3 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">
        {idx + 1}/{urls.length}
      </span>
    </div>
  );
}
