import React from 'react';
import { useNavigate } from 'react-router';
import { WifiOff, RefreshCw } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';

const OfflinePage: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  return (
    <div className="relative min-h-screen overflow-hidden bg-linear-to-br from-slate-50 via-white to-cyan-50 dark:from-slate-950 dark:via-slate-900 dark:to-cyan-950">
      <div className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full bg-cyan-200/40 blur-3xl dark:bg-cyan-500/10" />
      <div className="pointer-events-none absolute -bottom-32 left-10 h-72 w-72 rounded-full bg-indigo-200/40 blur-3xl dark:bg-indigo-500/10" />

      <div className="relative mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700 shadow-sm dark:bg-cyan-900/30 dark:text-cyan-200">
          <WifiOff className="h-8 w-8" />
        </div>
        <h1 className="mt-6 text-3xl font-semibold text-slate-900 dark:text-slate-100 sm:text-4xl">
          You are offline
        </h1>
        <p className="mt-3 text-base text-slate-600 dark:text-slate-300">
          We can still show cached mail, but syncing is paused until you reconnect.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
          <Button onClick={() => window.location.reload()} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Retry connection
          </Button>
          <Button
            variant="ghost"
            onClick={() => navigate(isAuthenticated ? '/dashboard' : '/login')}
            className="gap-2"
          >
            Back to {isAuthenticated ? 'dashboard' : 'login'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default OfflinePage;
