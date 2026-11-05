import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '@/shared/ui/Button';
import { useAuth } from '@/entities/user/model/AuthContext';
import { loginApi } from '../api/authApi';

export default function LoginForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setUser } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await loginApi(username, password);
      setUser(user);
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" aria-label="Форма входа">
      <div>
        <label htmlFor="username" className="block font-mono text-xs text-secondary/70 uppercase tracking-widest mb-1.5">Логин</label>
        <input
          id="username"
          className="w-full bg-bg border-2 border-secondary/40 px-4 py-2.5 text-sm text-text placeholder-secondary/40 focus:outline-none focus:border-accent transition-colors font-mono"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          placeholder="initiator-alpha"
          maxLength={255}
          required
        />
      </div>
      <div>
        <label htmlFor="password" className="block font-mono text-xs text-secondary/70 uppercase tracking-widest mb-1.5">Пароль</label>
        <input
          id="password"
          type="password"
          className="w-full bg-bg border-2 border-secondary/40 px-4 py-2.5 text-sm text-text placeholder-secondary/40 focus:outline-none focus:border-accent transition-colors font-mono"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          placeholder="••••••••"
          maxLength={255}
          required
        />
      </div>
      {error && <p className="text-danger text-sm">{error}</p>}
      <Button variant="square" type="submit" disabled={loading} className="w-full py-2.5 font-mono uppercase tracking-widest border-2 border-text" style={{ boxShadow: '3px 3px 0px #80A3FF' }}>
        {loading ? 'Вход…' : 'Войти'}
      </Button>
    </form>
  );
}
