import LoginForm from '@/features/auth/ui/LoginForm';
import bgImage from '@/assets/background.webp';

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-bg flex overflow-hidden relative">
      <div className="hidden md:flex flex-1 flex-col justify-end px-14 pb-14 relative overflow-hidden select-none">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${bgImage})` }}
        />
        <div className="absolute inset-0 bg-bg/40" />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to right, transparent 50%, #0B1B1D 100%)' }}
        />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to top, #0B1B1D 10%, transparent 50%)' }}
        />
        <div className="relative z-10">
          <h1 className="mt-3 text-[80px] font-black text-text leading-[0.88] tracking-tighter uppercase">
            RE<br />
            NEW<br />
            AL
          </h1>
        </div>
      </div>
      <div
        className="hidden md:block absolute top-[-8%] h-[116%] w-0.5 bg-accent/50 z-10 pointer-events-none"
        style={{ left: '62%', transform: 'rotate(3deg)', transformOrigin: 'top center' }}
      />

      <main role="main" className="w-full md:w-[38%] flex items-center justify-center min-h-screen p-8">
        <div className="w-full max-w-90">
          <div
            className="border-[3px] border-text bg-bg p-8"
            style={{ boxShadow: '7px 7px 0px #80A3FF' }}
          >
            <div className="mb-7">
              <span className="font-mono text-[11px] text-accent uppercase tracking-widest">
                // авторизация
              </span>
              <h2 className="mt-1 text-3xl font-black text-text uppercase tracking-tight">
                Войти
              </h2>
            </div>

            <LoginForm />
          </div>
        </div>
      </main>

    </div>
  );
}
