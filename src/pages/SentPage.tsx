import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, easeOut } from 'framer-motion';
import { 
  Send, 
  Trash2, 
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Mail,
  AlertCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Button from '@/components/ui/Button';
import { getSentMailsPaginated } from '@/lib/db';
import { useSync } from '@/contexts/SyncContext';

interface SentMail {
  id: string;
  threadId: string;
  fromEmail: string;
  toEmails: string[];
  subject: string;
  textBody: string | null;
  sentAt: string;
  status: 'pending' | 'sent' | 'failed';
}

const SentPage: React.FC = () => {
  const navigate = useNavigate();
  const { triggerSync, syncState } = useSync();
  const [sentMails, setSentMails] = useState<SentMail[]>([]);
  const [selectedMails, setSelectedMails] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const limit = 20;
  
  // Track mount state
  const isMountedRef = useRef(true);
  
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  /**
   * Load sent mails from local Dexie database
   * Data is synced via delta sync in the background
   */
  const loadSentMails = useCallback(async (page: number = 1) => {
    try {
      const result = await getSentMailsPaginated(page, limit);
      
      if (!isMountedRef.current) return;
      
      // Map SentMailRecord to SentMail interface
      const mails: SentMail[] = result.mails.map(mail => ({
        id: mail.id,
        threadId: mail.threadId,
        fromEmail: mail.fromEmail,
        toEmails: mail.toEmails,
        subject: mail.subject,
        textBody: mail.textBody || null,
        sentAt: mail.sentAt,
        status: mail.status
      }));
      
      setSentMails(mails);
      setTotalPages(result.totalPages);
      setTotal(result.total);
      setCurrentPage(result.page);
      setError(null);
    } catch (err: any) {
      console.error('Error loading sent mails:', err);
      if (isMountedRef.current) {
        setError(err.message || 'Failed to load sent mails');
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  // Initial load and page change
  useEffect(() => {
    setIsLoading(true);
    loadSentMails(currentPage);
  }, [currentPage, loadSentMails]);
  
  // Reload when sync completes
  useEffect(() => {
    if (!syncState.isSyncing && syncState.lastSync) {
      loadSentMails(currentPage);
    }
  }, [syncState.isSyncing, syncState.lastSync, currentPage, loadSentMails]);

  const handleSelectMail = (mailId: string) => {
    setSelectedMails(prev => 
      prev.includes(mailId) 
        ? prev.filter(id => id !== mailId)
        : [...prev, mailId]
    );
  };

  const handleSelectAll = () => {
    setSelectedMails(
      selectedMails.length === sentMails.length ? [] : sentMails.map(mail => mail.id)
    );
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Trigger delta sync which will update the local database
      await triggerSync();
      // Then reload from local database
      await loadSentMails(currentPage);
    } catch (err) {
      console.error('Error refreshing:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleMailClick = (mail: SentMail) => {
    navigate(`/email/${mail.threadId}?type=sent`);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const formatRecipients = (toEmails: string[]) => {
    if (toEmails.length === 0) return 'No recipients';
    if (toEmails.length === 1) return toEmails[0];
    return `${toEmails[0]} +${toEmails.length - 1} more`;
  };

  const pageVariants = {
    initial: { opacity: 0, y: 20 },
    animate: { 
      opacity: 1, 
      y: 0,
      transition: {
        duration: 0.4,
        ease: easeOut
      }
    },
  };

  const mailVariants = {
    initial: { opacity: 0, x: -20 },
    animate: { 
      opacity: 1, 
      x: 0,
      boxShadow: 'inset 0 0 0 999px rgba(59, 130, 246, 0)',
      transition: {
        duration: 0.3,
        ease: easeOut
      }
    },
    hover: {
      boxShadow: 'inset 0 0 0 999px rgba(59, 130, 246, 0.05)',
      transition: {
        duration: 0.2
      }
    }
  };

  return (
    <motion.div
      className="max-w-6xl mx-auto"
      variants={pageVariants}
      initial="initial"
      animate="animate"
    >
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
        {/* Header */}
        <div className="border-b border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <Send className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Sent
              </h1>
            </div>
            <div className="flex items-center space-x-3">
              <Button
                variant="outline"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="flex items-center space-x-2"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </Button>
            </div>
          </div>

          {/* Info Banner */}
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-sm text-blue-700 dark:text-blue-300">
            <div className="flex items-center space-x-2">
              <Mail className="w-4 h-4" />
              <span>You can see only Sent Mails using MailVoyage Application</span>
            </div>
          </div>
        </div>

        {/* Toolbar when items selected */}
        {selectedMails.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="border-b border-gray-200 dark:border-gray-700 p-4 bg-blue-50 dark:bg-blue-900/20"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-blue-600 dark:text-blue-400">
                {selectedMails.length} email{selectedMails.length !== 1 ? 's' : ''} selected
              </span>
              <div className="flex items-center space-x-2">
                <Button variant="outline" size="small" className="flex items-center space-x-1 text-red-600">
                  <Trash2 className="w-4 h-4" />
                  <span>Delete</span>
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Error State */}
        {error && (
          <div className="p-6 text-center">
            <div className="flex flex-col items-center space-y-3 text-red-500">
              <AlertCircle className="w-12 h-12" />
              <p>{error}</p>
              <Button variant="outline" onClick={handleRefresh}>
                Try Again
              </Button>
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading && !error && (
          <div className="p-6 text-center">
            <div className="flex flex-col items-center space-y-3">
              <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
              <p className="text-gray-500 dark:text-gray-400">Loading sent mails...</p>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && sentMails.length === 0 && (
          <div className="p-12 text-center">
            <div className="flex flex-col items-center space-y-4">
              <Send className="w-16 h-16 text-gray-300 dark:text-gray-600" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">No sent emails yet</h3>
              <p className="text-gray-500 dark:text-gray-400">
                When you send emails, they will appear here.
              </p>
              <Button onClick={() => navigate('/compose')}>
                Compose Email
              </Button>
            </div>
          </div>
        )}

        {/* Email List */}
        {!isLoading && !error && sentMails.length > 0 && (
          <>
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {/* Header Row */}
              <div className="p-4 bg-gray-50 dark:bg-gray-700/50">
                <div className="flex items-center space-x-4">
                  <input
                    type="checkbox"
                    checked={selectedMails.length === sentMails.length && sentMails.length > 0}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="flex-1 grid grid-cols-12 gap-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                    <div className="col-span-3">To</div>
                    <div className="col-span-6">Subject</div>
                    <div className="col-span-2">Sent</div>
                    <div className="col-span-1"></div>
                  </div>
                </div>
              </div>

              {/* Email Rows */}
              {sentMails.map((mail, index) => (
                <motion.div
                  key={mail.id}
                  variants={mailVariants}
                  initial="initial"
                  animate="animate"
                  whileHover="hover"
                  transition={{ delay: index * 0.03 }}
                  className={`
                    p-4 cursor-pointer group
                    ${selectedMails.includes(mail.id) ? 'bg-blue-100 dark:bg-blue-900/20' : ''}
                  `}
                  onClick={() => handleMailClick(mail)}
                >
                  <div className="flex items-center space-x-4">
                    <input
                      type="checkbox"
                      checked={selectedMails.includes(mail.id)}
                      onChange={() => handleSelectMail(mail.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      onClick={(e) => e.stopPropagation()}
                    />
                    
                    <div className="flex-1 grid grid-cols-12 gap-4">
                      {/* To */}
                      <div className="col-span-3 flex items-center space-x-2">
                        <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                          <Send className="w-4 h-4 text-green-600 dark:text-green-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {formatRecipients(mail.toEmails)}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            From: {mail.fromEmail}
                          </p>
                        </div>
                      </div>

                      {/* Subject and Preview */}
                      <div className="col-span-6 min-w-0">
                        <div className="flex items-center space-x-2 mb-1">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {mail.subject || '(No Subject)'}
                          </p>
                          {mail.status === 'failed' && (
                            <span className="px-2 py-0.5 text-xs bg-red-100 text-red-600 rounded-full">
                              Failed
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {mail.textBody || '(No content)'}
                        </p>
                      </div>

                      {/* Time */}
                      <div className="col-span-2 flex items-center">
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {formatDate(mail.sentAt)}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="col-span-1 flex items-center justify-end">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // Show more options
                          }}
                          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <MoreHorizontal className="w-4 h-4 text-gray-400" />
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Pagination */}
            <div className="border-t border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Showing {((currentPage - 1) * limit) + 1}-{Math.min(currentPage * limit, total)} of {total} emails
                </p>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="small"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="small"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage(prev => prev + 1)}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
};

export default SentPage;
