import { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import { X, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';

interface Props {
  image: string;
  aspect?: number;
  round?: boolean;
  onCrop: (blob: Blob) => void;
  onClose: () => void;
}

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.setAttribute('crossOrigin', 'anonymous');
    img.src = url;
  });
}

async function getCroppedBlob(src: string, crop: Area, rotation: number): Promise<Blob> {
  const img = await createImage(src);

  // Step 1: draw rotated image on a full-size canvas
  const rad = (rotation * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const rotW = Math.floor(img.width * cos + img.height * sin);
  const rotH = Math.floor(img.width * sin + img.height * cos);

  const rotCanvas = document.createElement('canvas');
  rotCanvas.width = rotW;
  rotCanvas.height = rotH;
  const rotCtx = rotCanvas.getContext('2d')!;
  rotCtx.translate(rotW / 2, rotH / 2);
  rotCtx.rotate(rad);
  rotCtx.drawImage(img, -img.width / 2, -img.height / 2);

  // Step 2: draw the cropped region onto the output canvas
  const outCanvas = document.createElement('canvas');
  outCanvas.width = crop.width;
  outCanvas.height = crop.height;
  const outCtx = outCanvas.getContext('2d')!;
  outCtx.drawImage(
    rotCanvas,
    crop.x, crop.y, crop.width, crop.height,
    0, 0, crop.width, crop.height,
  );

  return new Promise((resolve, reject) => {
    outCanvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))),
      'image/jpeg',
      0.92,
    );
  });
}

export default function ImageCropModal({ image, aspect = 1, round = false, onCrop, onClose }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedArea(pixels);
  }, []);

  const handleSave = async () => {
    if (!croppedArea) return;
    setSaving(true);
    try {
      const blob = await getCroppedBlob(image, croppedArea, rotation);
      onCrop(blob);
    } catch {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#111] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="font-semibold text-white">Crop & Adjust</h2>
          <button onClick={onClose} className="text-white/50 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Cropper */}
        <div className="relative h-72 sm:h-80 bg-black">
          <Cropper
            image={image}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={aspect}
            cropShape={round ? 'round' : 'rect'}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onRotationChange={setRotation}
            onCropComplete={onCropComplete}
          />
        </div>

        {/* Controls */}
        <div className="px-5 py-4 space-y-3">
          {/* Zoom */}
          <div className="flex items-center gap-3">
            <ZoomOut size={14} className="text-white/40" />
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-primary h-1"
            />
            <ZoomIn size={14} className="text-white/40" />
          </div>

          {/* Rotation */}
          <div className="flex items-center gap-3">
            <RotateCw size={14} className="text-white/40" />
            <input
              type="range"
              min={0}
              max={360}
              step={1}
              value={rotation}
              onChange={(e) => setRotation(Number(e.target.value))}
              className="flex-1 accent-primary h-1"
            />
            <span className="text-xs text-white/40 w-8 text-right">{rotation}°</span>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 border border-white/10 text-white/70 hover:text-white rounded-lg text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2.5 bg-primary hover:bg-primary-dark disabled:opacity-40 text-dark font-semibold rounded-lg text-sm transition-colors flex items-center justify-center"
            >
              {saving
                ? <div className="w-4 h-4 border-2 border-dark border-t-transparent rounded-full animate-spin" />
                : 'Apply'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
