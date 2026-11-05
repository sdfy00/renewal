import { Link } from 'react-router-dom';
import { useAuth } from '@/entities/user/model/AuthContext';

export default function HomePage() {
  const { user } = useAuth();
  if (!user) return null;

  const spaceMap = new Map<string, string[]>();
  for (const r of user.spaceRoles) {
    const roles = spaceMap.get(r.spaceSlug) ?? [];
    if (!roles.includes(r.role)) roles.push(r.role);
    spaceMap.set(r.spaceSlug, roles);
  }
  const spaces = Array.from(spaceMap.entries()).map(([slug, roles]) => ({ slug, roles }));

  return (
    <div className="w-full max-w-[min(1120px,calc(100%-64px))] mx-auto py-10">
      <h2 className="text-2xl font-black tracking-tight leading-none text-text mb-8">
        Рабочие пространства
      </h2>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {spaces.map(({ slug, roles }) => (
          <Link
            key={slug}
            to={`/spaces/${slug}`}
            className="block p-6 bg-card rounded-[20px] border border-transparent hover:border-accent/40 transition-colors group"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-text text-lg group-hover:text-accent transition-colors">
                {slug}
              </span>
              <div className="flex gap-1.5 flex-wrap justify-end">
                {roles.map((role) => (
                  <span key={role} className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                    role === 'approver'
                      ? 'bg-accent/15 text-accent'
                      : 'bg-info/15 text-info'
                  }`}>
                    {role === 'approver' ? 'согласующий' : 'инициатор'}
                  </span>
                ))}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
