import { Link, useNavigate } from 'react-router-dom';
import { logoutApi } from '@/features/auth/api/authApi';
import { useAuth } from '@/entities/user/model/AuthContext';

export default function Navbar() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();

  async function logout() {
    await logoutApi().catch(() => {});
    setUser(null);
    navigate('/login');
  }

  return (
    <header
      className="bg-bg border-text sticky top-0 z-40"
    >
      <div className="w-full max-w-[min(1120px,calc(100%-64px))] mx-auto h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 group">
          <span className="font-black text-text uppercase tracking-tight text-lg leading-none">
            RENEWAL
          </span>
        </Link>
        {user && (
          <div className="flex items-center gap-4">
            <span className="font-mono text-xs text-secondary/70 uppercase tracking-widest hidden sm:block">
              {user.username}
            </span>
            <button
              onClick={() => void logout()}
              className="font-mono text-xs text-secondary/60 uppercase tracking-widest cursor-pointer border-2 border-secondary/30 px-3 py-1.5 hover:border-accent hover:text-accent transition-colors"
            >
              выйти
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
