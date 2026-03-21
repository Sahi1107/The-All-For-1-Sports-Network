import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Type, Image, Video, Upload } from 'lucide-react';
import api from '../api/client';
import toast from 'react-hot-toast';

type PostType = 'TEXT' | 'IMAGE' | 'HIGHLIGHT';

interface Props {
  onClose: () => void;
}

export default function CreatePostModal({ onClose }: Props) {
  const qc = useQueryClient();
  const [type, setType] = useState<PostType>('TEXT');
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append('type', type);
      if (content) formData.append('content', content);
      if (title) formData.append('title', title);
      if (file) formData.append('media', file);

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
    (type === 'IMAGE' && file) ||
    (type === 'HIGHLIGHT' && file && title.trim());

  const acceptType = type === 'HIGHLIGHT' ? 'video/*' : 'image/*';

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
              onClick={() => { setType(key); setFile(null); setContent(''); setTitle(''); }}
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
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-white/15 rounded-xl p-6 text-center cursor-pointer hover:border-primary/60 transition-colors"
              >
                {file ? (
                  <div>
                    <p className="text-sm font-medium text-white truncate">{file.name}</p>
                    <p className="text-xs text-white/40 mt-1">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
                  </div>
                ) : (
                  <div className="text-white/40">
                    <Upload size={22} className="mx-auto mb-2" />
                    <p className="text-sm">Click to select {type === 'IMAGE' ? 'photo' : 'video'}</p>
                    <p className="text-xs mt-1">{type === 'IMAGE' ? 'JPG, PNG, WebP · max 5 MB' : 'MP4, MOV · max 100 MB'}</p>
                  </div>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept={acceptType}
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
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
    </div>
  );
}
