import React from 'react';
import { useNavigate } from 'react-router';
import { AlertTriangle, RefreshCw, Server } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';

const ServerErrorPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  return (
    <div className="relative min-h-screen overflow-hidden bg-linear-to-br from-rose-50 via-white to-amber-50 dark:from-slate-950 dark:via-slate-900 dark:to-rose-950">
      <div className="pointer-events-none absolute -top-32 left-10 h-72 w-72 rounded-full bg-rose-200/40 blur-3xl dark:bg-rose-500/10" />
      <div className="pointer-events-none absolute -bottom-32 right-10 h-72 w-72 rounded-full bg-amber-200/40 blur-3xl dark:bg-amber-500/10" />

      <div className="relative mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-100 text-rose-700 shadow-sm dark:bg-rose-900/30 dark:text-rose-200">
          <Server className="h-8 w-8" />
        </div>
        <h1 className="mt-6 text-3xl font-semibold text-slate-900 dark:text-slate-100 sm:text-4xl">
          The server needs a moment
        </h1>
        <p className="mt-3 text-base text-slate-600 dark:text-slate-300">
          We are unable to reach the backend right now. It could be a temporary outage or a deploy in progress.
        </p>

        <div className="mt-6 flex items-center gap-2 rounded-full bg-rose-50 px-4 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-200">
          <AlertTriangle className="h-4 w-4" />
          <span>We will retry automatically in the background.</span>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
          <Button onClick={() => window.location.reload()} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Retry now
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

export default ServerErrorPage;
