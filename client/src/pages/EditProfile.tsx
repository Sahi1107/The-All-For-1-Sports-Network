import { useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import { Camera, Save, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import ImageCropModal from '../components/ImageCropModal';
import { COUNTRY_LIST, getStates, HEIGHT_OPTIONS } from '../data/locationData';

const PHONE_CODES = [
  { code: '+91', label: '🇮🇳 +91' },
  { code: '+1',  label: '🇺🇸 +1' },
  { code: '+44', label: '🇬🇧 +44' },
  { code: '+61', label: '🇦🇺 +61' },
  { code: '+971', label: '🇦🇪 +971' },
  { code: '+966', label: '🇸🇦 +966' },
  { code: '+65', label: '🇸🇬 +65' },
  { code: '+60', label: '🇲🇾 +60' },
  { code: '+92', label: '🇵🇰 +92' },
  { code: '+94', label: '🇱🇰 +94' },
  { code: '+880', label: '🇧🇩 +880' },
  { code: '+977', label: '🇳🇵 +977' },
  { code: '+27', label: '🇿🇦 +27' },
  { code: '+234', label: '🇳🇬 +234' },
  { code: '+254', label: '🇰🇪 +254' },
  { code: '+49', label: '🇩🇪 +49' },
  { code: '+33', label: '🇫🇷 +33' },
  { code: '+39', label: '🇮🇹 +39' },
  { code: '+34', label: '🇪🇸 +34' },
  { code: '+55', label: '🇧🇷 +55' },
  { code: '+86', label: '🇨🇳 +86' },
  { code: '+81', label: '🇯🇵 +81' },
  { code: '+82', label: '🇰🇷 +82' },
];

const POSITIONS: Record<string, string[]> = {
  BASKETBALL: ['Point Guard', 'Shooting Guard', 'Small Forward', 'Power Forward', 'Center'],
  FOOTBALL: ['Goalkeeper', 'Defender', 'Midfielder', 'Winger', 'Striker'],
  CRICKET: ['Batsman', 'Bowler', 'All-Rounder', 'Wicket-Keeper'],
};

function parseLocation(loc: string | undefined): { country: string; state: string; city: string } {
  if (!loc) return { country: '', state: '', city: '' };
  const parts = loc.split(', ');
  if (parts.length === 3) return { city: parts[0], state: parts[1], country: parts[2] };
  if (parts.length === 2) return { country: parts[1], state: parts[0], city: '' };
  return { country: parts[0], state: '', city: '' };
}

export default function EditProfile() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  // Parse existing phone into country code + number
  const existingPhone = (user as any)?.phone ?? '';
  const parsePhone = (ph: string) => {
    const match = ph.match(/^(\+\d{1,4})\s*(.*)$/);
    return match ? { code: match[1], number: match[2] } : { code: '+91', number: ph };
  };
  const parsed = parsePhone(existingPhone);

  const [form, setForm] = useState({
    name: user?.name ?? '',
    bio: user?.bio ?? '',
    position: user?.position ?? '',
    height: user?.height ?? '',
    phone: parsed.number,
    contactEmail: (user as any)?.contactEmail ?? '',
  });
  const [phoneCode, setPhoneCode] = useState(parsed.code);
  const [country, setCountry] = useState(() => parseLocation(user?.location).country);
  const [state,   setState]   = useState(() => parseLocation(user?.location).state);
  const [city,    setCity]    = useState(() => parseLocation(user?.location).city);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user?.avatar ?? null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [cropImage, setCropImage] = useState<string | null>(null);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCropImage(URL.createObjectURL(file));
  };

  const handleCropped = (blob: Blob) => {
    const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(blob));
    setCropImage(null);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      // Combine country code + phone number
      const fullPhone = form.phone.trim() ? `${phoneCode} ${form.phone.trim()}` : '';
      Object.entries(form).forEach(([k, v]) => {
        if (k === 'phone') return; // handled separately
        if (v !== '') formData.append(k, v);
      });
      if (fullPhone) formData.append('phone', fullPhone);
      const location = country
        ? state
          ? city ? `${city}, ${state}, ${country}` : `${state}, ${country}`
          : country
        : '';
      if (location) formData.append('location', location);
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

          <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-custom mb-1">Country</label>
              <select
                value={country}
                onChange={e => { setCountry(e.target.value); setState(''); setCity(''); }}
                className="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary"
              >
                <option value="">Select country</option>
                {COUNTRY_LIST.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-custom mb-1">State / Province</label>
              <select
                value={state}
                onChange={e => { setState(e.target.value); setCity(''); }}
                disabled={!country}
                className="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary disabled:opacity-50"
              >
                <option value="">Select state</option>
                {getStates(country).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-custom mb-1">City</label>
              <input
                type="text"
                value={city}
                onChange={e => setCity(e.target.value)}
                disabled={!state}
                placeholder="Enter your city"
                className="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-sm text-white placeholder-gray-custom focus:outline-none focus:border-primary disabled:opacity-50"
              />
            </div>
          </div>

          {user?.role !== 'ADMIN' && (
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
          )}

          {user?.role !== 'ADMIN' && (
            <div>
              <label className="block text-sm text-gray-custom mb-1">Height</label>
              <select
                name="height"
                value={form.height}
                onChange={handleChange}
                className="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary"
              >
                <option value="">Select height</option>
                {HEIGHT_OPTIONS.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Contact & Socials */}
        <div>
          <h3 className="text-sm font-semibold text-white/80 mb-3">Contact & Socials</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-custom mb-1">Phone (private)</label>
              <div className="flex gap-2">
                <select
                  value={phoneCode}
                  onChange={(e) => setPhoneCode(e.target.value)}
                  className="w-28 bg-dark border border-dark-lighter rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:border-primary appearance-none"
                >
                  {PHONE_CODES.map(({ code, label }) => (
                    <option key={code} value={code}>{label}</option>
                  ))}
                </select>
                <input name="phone" value={form.phone} onChange={handleChange} placeholder="98765 43210"
                  className="flex-1 bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-sm text-white placeholder-gray-custom focus:outline-none focus:border-primary" />
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-custom mb-1">Public contact email</label>
              <input name="contactEmail" type="email" value={form.contactEmail} onChange={handleChange} placeholder="me@example.com"
                className="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-sm text-white placeholder-gray-custom focus:outline-none focus:border-primary" />
            </div>
          </div>
        </div>

        {/* Sport & Role (read-only) */}
        <div className={`grid gap-4 ${user?.role === 'ADMIN' ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {user?.role !== 'ADMIN' && (
            <div>
              <label className="block text-sm text-gray-custom mb-1">Sport</label>
              <div className="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-sm text-gray-custom">{user?.sport}</div>
            </div>
          )}
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

      {/* Crop modal for avatar */}
      {cropImage && (
        <ImageCropModal
          image={cropImage}
          aspect={1}
          round
          onCrop={handleCropped}
          onClose={() => setCropImage(null)}
        />
      )}
    </div>
  );
}
