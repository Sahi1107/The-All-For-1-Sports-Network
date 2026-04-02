import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Search, MapPin, Filter } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';

const ROLES = ['ALL', 'ATHLETE', 'COACH', 'SCOUT'] as const;
const SPORTS = ['ALL', 'BASKETBALL', 'FOOTBALL', 'CRICKET'] as const;

export default function Explore() {
  const { user: currentUser } = useAuth();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<string>('ALL');
  const [sport, setSport] = useState<string>('ALL');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['explore-users', search, role, sport, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (role !== 'ALL') params.set('role', role);
      if (sport !== 'ALL') params.set('sport', sport);
      params.set('page', String(page));
      const { data } = await api.get(`/users?${params}`);
      return data;
    },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Explore</h1>

      {/* Search & Filters */}
      <div className="space-y-4 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-custom" size={20} />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search athletes, coaches, scouts..."
            className="w-full pl-10 pr-4 py-3 bg-dark-light border border-dark-lighter rounded-lg focus:outline-none focus:border-primary text-white"
          />
        </div>

        <div className="flex gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-gray-custom" />
            <span className="text-sm text-gray-custom">Role:</span>
            {ROLES.map((r) => (
              <button
                key={r}
                onClick={() => { setRole(r); setPage(1); }}
                className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
                  role === r ? 'bg-primary text-dark font-semibold' : 'bg-dark-lighter text-gray-custom hover:text-white'
                }`}
              >
                {r === 'ALL' ? 'All' : r.charAt(0) + r.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-custom">Sport:</span>
            {SPORTS.map((s) => (
              <button
                key={s}
                onClick={() => { setSport(s); setPage(1); }}
                className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
                  sport === s ? 'bg-secondary text-white' : 'bg-dark-lighter text-gray-custom hover:text-white'
                }`}
              >
                {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data?.users?.map((user: any) => (
              <Link
                key={user.id}
                to={`/profile/${user.id}`}
                className="bg-dark-light border border-dark-lighter rounded-xl p-4 hover:border-primary/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  {user.avatar ? (
                    <img src={user.avatar} alt="" className="w-14 h-14 rounded-full object-cover" />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center text-lg font-bold text-primary-light">
                      {user.name?.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold truncate">{user.name}</h3>
                      {user.verified && currentUser?.role === 'ADMIN' && <span className="text-accent text-xs">Verified</span>}
                    </div>
                    <p className="text-sm text-gray-custom capitalize">
                      {user.role?.toLowerCase()} · {user.sport?.toLowerCase()}
                      {user.position && ` · ${user.position}`}
                    </p>
                    {user.location && (
                      <p className="text-xs text-gray-custom flex items-center gap-1 mt-1">
                        <MapPin size={12} /> {user.location}
                      </p>
                    )}
                  </div>
                  <div className="text-right text-xs text-gray-custom">
                    <p>{user._count?.followers || 0} followers</p>
                    <p>{user._count?.highlights || 0} highlights</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {data?.users?.length === 0 && (
            <div className="text-center py-12 text-gray-custom">No users found</div>
          )}

          {/* Pagination */}
          {data?.totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-6">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 bg-dark-lighter rounded-lg text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <span className="px-4 py-2 text-sm text-gray-custom">
                Page {page} of {data.totalPages}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= data.totalPages}
                className="px-4 py-2 bg-dark-lighter rounded-lg text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
