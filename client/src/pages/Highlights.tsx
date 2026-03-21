import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import { Upload, Trash2, Eye, MapPin, Plus, X } from 'lucide-react';
import toast from 'react-hot-toast';

function timeAgo(date: string) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface UploadForm {
  title: string;
  description: string;
  tournamentLocation: string;
}

export default function Highlights() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [form, setForm] = useState<UploadForm>({ title: '', description: '', tournamentLocation: '' });
  const [uploadProgress, setUploadProgress] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ['my-highlights'],
    queryFn: async () => {
      const { data } = await api.get(`/highlights/user/${user?.id}`);
      return data;
    },
    enabled: !!user?.id,
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!videoFile) throw new Error('No video selected');
      const formData = new FormData();
      formData.append('video', videoFile);
      formData.append('title', form.title);
      if (form.description) formData.append('description', form.description);
      if (form.tournamentLocation) formData.append('tournamentLocation', form.tournamentLocation);

      const { data } = await api.post('/highlights', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (e.total) setUploadProgress(Math.round((e.loaded / e.total) * 100));
        },
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-highlights'] });
      toast.success('Highlight uploaded!');
      setShowUpload(false);
      setVideoFile(null);
      setForm({ title: '', description: '', tournamentLocation: '' });
      setUploadProgress(0);
    },
    onError: () => toast.error('Upload failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/highlights/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-highlights'] });
      toast.success('Deleted');
    },
    onError: () => toast.error('Delete failed'),
  });

  const highlights = data?.highlights ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">My Highlights</h1>
          <p className="text-gray-custom text-sm mt-1">{highlights.length} video{highlights.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark text-dark font-semibold text-sm rounded-lg transition-colors"
        >
          <Plus size={16} />
          Upload Highlight
        </button>
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-dark-light rounded-xl border border-dark-lighter w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b border-dark-lighter">
              <h2 className="font-semibold">Upload Highlight</h2>
              <button onClick={() => { setShowUpload(false); setVideoFile(null); setUploadProgress(0); }} className="text-gray-custom hover:text-white">
                <X size={18} />
              </button>
            </div>
            <form
              onSubmit={(e) => { e.preventDefault(); uploadMutation.mutate(); }}
              className="p-5 space-y-4"
            >
              {/* Video picker */}
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-dark-lighter rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
              >
                {videoFile ? (
                  <div>
                    <p className="text-sm font-medium text-white">{videoFile.name}</p>
                    <p className="text-xs text-gray-custom mt-1">{(videoFile.size / 1024 / 1024).toFixed(1)} MB</p>
                  </div>
                ) : (
                  <div>
                    <Upload size={24} className="mx-auto mb-2 text-gray-custom" />
                    <p className="text-sm text-gray-custom">Click to select video</p>
                    <p className="text-xs text-gray-custom mt-1">MP4, MOV up to 100MB</p>
                  </div>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)}
              />

              <input
                value={form.title}
                onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
                required
                placeholder="Title *"
                className="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-sm text-white placeholder-gray-custom focus:outline-none focus:border-primary"
              />
              <textarea
                value={form.description}
                onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Description (optional)"
                rows={2}
                className="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-sm text-white placeholder-gray-custom focus:outline-none focus:border-primary resize-none"
              />
              <input
                value={form.tournamentLocation}
                onChange={(e) => setForm(f => ({ ...f, tournamentLocation: e.target.value }))}
                placeholder="Tournament / Location (optional)"
                className="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-sm text-white placeholder-gray-custom focus:outline-none focus:border-primary"
              />

              {uploadMutation.isPending && (
                <div>
                  <div className="flex justify-between text-xs text-gray-custom mb-1">
                    <span>Uploading...</span><span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-dark rounded-full h-1.5">
                    <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={!videoFile || !form.title || uploadMutation.isPending}
                className="w-full py-2.5 bg-primary hover:bg-primary-dark disabled:opacity-50 text-dark font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {uploadMutation.isPending
                  ? <div className="w-4 h-4 border-2 border-dark border-t-transparent rounded-full animate-spin" />
                  : <Upload size={16} />}
                Upload
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Grid */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : highlights.length === 0 ? (
        <div className="bg-dark-light rounded-xl border border-dark-lighter p-16 text-center">
          <Upload size={32} className="mx-auto mb-3 text-gray-custom" />
          <p className="text-gray-custom">No highlights yet. Upload your first video!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {highlights.map((h: any) => (
            <div key={h.id} className="bg-dark-light rounded-xl border border-dark-lighter overflow-hidden group">
              <div className="relative">
                <video
                  src={h.videoUrl}
                  className="w-full aspect-video object-cover"
                  controls
                  preload="metadata"
                />
              </div>
              <div className="p-4">
                <p className="font-medium truncate">{h.title}</p>
                {h.description && <p className="text-sm text-gray-custom mt-1 line-clamp-2">{h.description}</p>}
                <div className="flex items-center justify-between mt-3 text-xs text-gray-custom">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1"><Eye size={12} />{h.views ?? 0}</span>
                    {h.tournamentLocation && (
                      <span className="flex items-center gap-1"><MapPin size={12} />{h.tournamentLocation}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span>{timeAgo(h.createdAt)}</span>
                    <button
                      onClick={() => {
                        if (confirm('Delete this highlight?')) deleteMutation.mutate(h.id);
                      }}
                      className="text-gray-custom hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
