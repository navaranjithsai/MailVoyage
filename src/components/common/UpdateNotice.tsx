import React from 'react';
import { Sparkles, X, ExternalLink } from 'lucide-react';
import { RELEASES_URL } from '@/lib/versionCheck';

interface UpdateNoticeProps {
  latestTag: string;
  currentVersion: string;
  onDismiss: () => void;
}

/**
 * Non-intrusive, dismissible banner shown when a newer release exists.
 * Renders only plain text (tag + current version) — no remote HTML — and
 * links only to the GitHub releases page. Nothing is auto-downloaded.
 */
const UpdateNotice: React.FC<UpdateNoticeProps> = ({ latestTag, currentVersion, onDismiss }) => {
  return (
    <div
      role="status"
      className="mb-6 flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-4 py-3"
    >
      <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />

      <div className="flex-1 text-sm text-blue-900 dark:text-blue-200">
        A new version <strong>{latestTag}</strong> is available (you have{' '}
        <strong>v{currentVersion}</strong>). New releases include bug fixes and security
        improvements.{' '}
        <a
          href={RELEASES_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium underline underline-offset-2 hover:text-blue-700 dark:hover:text-blue-300"
        >
          View release <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss update notice for 24 hours"
        className="self-start sm:self-center rounded-md p-1 text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export default UpdateNotice;
