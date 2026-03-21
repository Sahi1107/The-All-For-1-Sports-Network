import { useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import { Camera, Save, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';

const POSITIONS: Record<string, string[]> = {
  BASKETBALL: ['Point Guard', 'Shooting Guard', 'Small Forward', 'Power Forward', 'Center'],
  FOOTBALL: ['Goalkeeper', 'Defender', 'Midfielder', 'Winger', 'Striker'],
  CRICKET: ['Batsman', 'Bowler', 'All-Rounder', 'Wicket-Keeper'],
};

export default function EditProfile() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    name: user?.name ?? '',
    bio: user?.bio ?? '',
    location: user?.location ?? '',
    position: user?.position ?? '',
    age: user?.age ? String(user.age) : '',
    height: user?.height ?? '',
  });
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user?.avatar ?? null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      Object.entries(form).forEach(([k, v]) => {
        if (v !== '') formData.append(k, v);
      });
      if (avatarFile) formData.append('avatar', avatarFile);
      const { data } = await api.put('/users/profile', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data;
    },
    onSuccess: (data) => {
      updateUser(data.user);
      toast.success('Profile updated!');
      navigate(`/profile/${user?.id}`);
    },
    onError: () => toast.error('Failed to update profile'),
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-lg hover:bg-dark-light transition-colors text-gray-custom hover:text-white"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-2xl font-bold">Edit Profile</h1>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}
        className="bg-dark-light rounded-xl border border-dark-lighter p-6 space-y-6"
      >
        {/* Avatar */}
        <div className="flex flex-col items-center gap-3">
          <div
            className="relative w-24 h-24 rounded-full bg-dark-lighter border-2 border-dark-lighter cursor-pointer group overflow-hidden"
            onClick={() => fileRef.current?.click()}
          >
            {avatarPreview ? (
              <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-gray-custom">
                {form.name?.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera size={20} className="text-white" />
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          <button type="button" onClick={() => fileRef.current?.click()} className="text-xs text-primary hover:text-primary-light">
            Change photo
          </button>
        </div>

        {/* Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-sm text-gray-custom mb-1">Full Name</label>
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              required
              className="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-sm text-white placeholder-gray-custom focus:outline-none focus:border-primary"
              placeholder="Your full name"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm text-gray-custom mb-1">Bio</label>
            <textarea
              name="bio"
              value={form.bio}
              onChange={handleChange}
              rows={3}
              className="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-sm text-white placeholder-gray-custom focus:outline-none focus:border-primary resize-none"
              placeholder="Tell the community about yourself..."
            />
          </div>

          <div>
            <label className="block text-sm text-gray-custom mb-1">Location</label>
            <input
              name="location"
              value={form.location}
              onChange={handleChange}
              className="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-sm text-white placeholder-gray-custom focus:outline-none focus:border-primary"
              placeholder="City, Country"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-custom mb-1">Position</label>
            <select
              name="position"
              value={form.position}
              onChange={handleChange}
              className="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary"
            >
              <option value="">Select position</option>
              {(POSITIONS[user?.sport ?? ''] ?? []).map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-custom mb-1">Age</label>
            <input
              name="age"
              type="number"
              min="10"
              max="60"
              value={form.age}
              onChange={handleChange}
              className="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-sm text-white placeholder-gray-custom focus:outline-none focus:border-primary"
              placeholder="25"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-custom mb-1">Height</label>
            <input
              name="height"
              value={form.height}
              onChange={handleChange}
              className="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-sm text-white placeholder-gray-custom focus:outline-none focus:border-primary"
              placeholder='6&apos;2" or 188cm'
            />
          </div>
        </div>

        {/* Sport & Role (read-only) */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-custom mb-1">Sport</label>
            <div className="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-sm text-gray-custom">{user?.sport}</div>
          </div>
          <div>
            <label className="block text-sm text-gray-custom mb-1">Role</label>
            <div className="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-sm text-gray-custom">{user?.role}</div>
          </div>
        </div>

        <button
          type="submit"
          disabled={mutation.isPending}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary hover:bg-primary-dark disabled:opacity-50 text-dark font-semibold rounded-lg transition-colors"
        >
          {mutation.isPending
            ? <div className="w-4 h-4 border-2 border-dark border-t-transparent rounded-full animate-spin" />
            : <Save size={16} />}
          Save Changes
        </button>
      </form>
    </div>
  );
}
