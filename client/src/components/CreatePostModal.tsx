import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Type, Image, Video, Upload, Plus, Trash2 } from 'lucide-react';
import api from '../api/client';
import toast from 'react-hot-toast';
import ImageCropModal from './ImageCropModal';

type PostType = 'TEXT' | 'IMAGE' | 'HIGHLIGHT';

interface Props {
  onClose: () => void;
}

export default function CreatePostModal({ onClose }: Props) {
  const qc = useQueryClient();
  const [type, setType] = useState<PostType>('TEXT');
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  // Crop state: queue of raw files waiting to be cropped
  const [cropQueue, setCropQueue] = useState<string[]>([]);
  const [rawQueue, setRawQueue] = useState<File[]>([]);

  const mutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append('type', type);
      if (content) formData.append('content', content);
      if (title) formData.append('title', title);
      for (const file of files) {
        formData.append('media', file);
      }

      const { data } = await api.post('/posts', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (e.total) setProgress(Math.round((e.loaded / e.total) * 100));
        },
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['feed'] });
      qc.invalidateQueries({ queryKey: ['profile'] });
      qc.invalidateQueries({ queryKey: ['user-posts'] });
      toast.success('Posted!');
      onClose();
    },
    onError: () => toast.error('Failed to post'),
  });

  const canSubmit =
    (type === 'TEXT' && content.trim()) ||
    (type === 'IMAGE' && files.length > 0) ||
    (type === 'HIGHLIGHT' && files.length > 0 && title.trim());

  const acceptType = type === 'HIGHLIGHT' ? 'video/*' : 'image/*';

  const handleFiles = (selected: FileList | null) => {
    if (!selected) return;
    const newFiles = Array.from(selected);
    if (type === 'IMAGE') {
      // Open crop modal for each selected image
      const urls = newFiles.map((f) => URL.createObjectURL(f));
      setRawQueue(newFiles);
      setCropQueue(urls);
    } else {
      // Highlights: single video, no crop
      setFiles([newFiles[0]]);
    }
  };

  const handleCropped = (blob: Blob) => {
    const file = new File([blob], rawQueue[0]?.name || 'photo.jpg', { type: 'image/jpeg' });
    setFiles((prev) => [...prev, file].slice(0, 10));
    // Advance to next in queue
    setCropQueue((q) => q.slice(1));
    setRawQueue((q) => q.slice(1));
  };

  const handleCropSkip = () => {
    // Skip cropping, use original file
    if (rawQueue[0]) {
      setFiles((prev) => [...prev, rawQueue[0]].slice(0, 10));
    }
    setCropQueue((q) => q.slice(1));
    setRawQueue((q) => q.slice(1));
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#111] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="font-semibold text-white">Create Post</h2>
          <button onClick={onClose} className="text-white/50 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Type tabs */}
        <div className="flex border-b border-white/10">
          {([
            { key: 'TEXT', icon: Type, label: 'Text' },
            { key: 'IMAGE', icon: Image, label: 'Photo' },
            { key: 'HIGHLIGHT', icon: Video, label: 'Highlight' },
          ] as const).map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => { setType(key); setFiles([]); setContent(''); setTitle(''); }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
                type === key
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-white/50 hover:text-white'
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>

        {/* Form */}
        <div className="p-5 space-y-4">
          {/* Title — for highlight only */}
          {type === 'HIGHLIGHT' && (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title *"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-primary"
            />
          )}

          {/* Content / caption */}
          {(type === 'TEXT' || type === 'IMAGE') && (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={type === 'TEXT' ? "What's on your mind?" : 'Add a caption…'}
              rows={type === 'TEXT' ? 5 : 3}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-primary resize-none"
            />
          )}

          {/* File picker — image or video */}
          {(type === 'IMAGE' || type === 'HIGHLIGHT') && (
            <>
              {/* Thumbnail previews for selected images */}
              {type === 'IMAGE' && files.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {files.map((f, i) => (
                    <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-white/10 group">
                      <img
                        src={URL.createObjectURL(f)}
                        alt={f.name}
                        className="w-full h-full object-cover"
                      />
                      <button
                        onClick={() => removeFile(i)}
                        className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 size={14} className="text-red-400" />
                      </button>
                    </div>
                  ))}
                  {files.length < 10 && (
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="w-20 h-20 rounded-lg border-2 border-dashed border-white/15 flex items-center justify-center hover:border-primary/60 transition-colors"
                    >
                      <Plus size={20} className="text-white/40" />
                    </button>
                  )}
                </div>
              )}

              {/* Drop zone — show when no files selected, or for highlights */}
              {(files.length === 0 || type === 'HIGHLIGHT') && !(type === 'IMAGE' && files.length > 0) && (
                <div
                  onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed border-white/15 rounded-xl p-6 text-center cursor-pointer hover:border-primary/60 transition-colors"
                >
                  {files.length > 0 && type === 'HIGHLIGHT' ? (
                    <div>
                      <p className="text-sm font-medium text-white truncate">{files[0].name}</p>
                      <p className="text-xs text-white/40 mt-1">{(files[0].size / 1024 / 1024).toFixed(1)} MB</p>
                    </div>
                  ) : (
                    <div className="text-white/40">
                      <Upload size={22} className="mx-auto mb-2" />
                      <p className="text-sm">Click to select {type === 'IMAGE' ? 'photos' : 'video'}</p>
                      <p className="text-xs mt-1">
                        {type === 'IMAGE' ? 'JPG, PNG, WebP · max 5 MB each · up to 10 photos' : 'MP4, MOV · max 100 MB'}
                      </p>
                    </div>
                  )}
                </div>
              )}

              <input
                ref={fileRef}
                type="file"
                accept={acceptType}
                multiple={type === 'IMAGE'}
                className="hidden"
                onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
              />
            </>
          )}

          {/* Upload progress */}
          {mutation.isPending && (type === 'IMAGE' || type === 'HIGHLIGHT') && (
            <div>
              <div className="flex justify-between text-xs text-white/40 mb-1">
                <span>Uploading…</span><span>{progress}%</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-1.5">
                <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={() => mutation.mutate()}
            disabled={!canSubmit || mutation.isPending}
            className="w-full py-2.5 bg-primary hover:bg-primary-dark disabled:opacity-40 text-dark font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
          >
            {mutation.isPending
              ? <div className="w-4 h-4 border-2 border-dark border-t-transparent rounded-full animate-spin" />
              : 'Post'}
          </button>
        </div>
      </div>

      {/* Crop modal — processes one image at a time from the queue */}
      {cropQueue.length > 0 && (
        <ImageCropModal
          image={cropQueue[0]}
          aspect={4 / 5}
          onCrop={handleCropped}
          onClose={handleCropSkip}
        />
      )}
    </div>
  );
}
