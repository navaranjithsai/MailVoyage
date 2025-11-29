import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, easeOut } from 'framer-motion';
import { 
  FileEdit, 
  Trash2, 
  Edit3,
  RefreshCw,
  AlertCircle,
  Paperclip,
  Clock,
  Mail,
  X,
  Eye,
  Info
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Button from '@/components/ui/Button';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import {
  getAllDrafts,
  deleteDraft,
  deleteDrafts,
  type EmailDraft,
} from '@/lib/mailCache';
import { toast } from '@/lib/toast';

const DraftsPage: React.FC = () => {
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState<EmailDraft[]>([]);
  const [selectedDrafts, setSelectedDrafts] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredDraft, setHoveredDraft] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [draftToDelete, setDraftToDelete] = useState<string | null>(null);
  const [previewDraft, setPreviewDraft] = useState<EmailDraft | null>(null);
  
  // Track mount state
  const isMountedRef = useRef(true);

  /**
   * Load all drafts from IndexedDB
   */
  const loadDrafts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const allDrafts = await getAllDrafts();
      if (isMountedRef.current) {
        setDrafts(allDrafts);
        setIsLoading(false);
      }
    } catch (err: any) {
      console.error('Error loading drafts:', err);
      if (isMountedRef.current) {
        setError(err.message || 'Failed to load drafts');
        setIsLoading(false);
      }
    }
  }, []);

  // Initial load
  useEffect(() => {
    isMountedRef.current = true;
    loadDrafts();
    
    return () => {
      isMountedRef.current = false;
    };
  }, [loadDrafts]);

  const handleSelectDraft = (draftId: string) => {
    setSelectedDrafts(prev => 
      prev.includes(draftId) 
        ? prev.filter(id => id !== draftId)
        : [...prev, draftId]
    );
  };

  const handleSelectAll = () => {
    setSelectedDrafts(
      selectedDrafts.length === drafts.length ? [] : drafts.map(draft => draft.id)
    );
  };

  const handleRefresh = async () => {
    await loadDrafts();
    toast.success('Drafts refreshed');
  };

  const handleEditDraft = (draft: EmailDraft) => {
    // Navigate to compose page with draft data
    navigate('/compose', { 
      state: { 
        draftId: draft.id,
        fromDraft: true,
        draftData: draft
      } 
    });
  };

  const handleDeleteDraft = async (draftId: string) => {
    setDraftToDelete(draftId);
    setShowDeleteConfirm(true);
  };

  const confirmDeleteDraft = async () => {
    if (!draftToDelete) return;
    
    try {
      await deleteDraft(draftToDelete);
      setDrafts(prev => prev.filter(d => d.id !== draftToDelete));
      setSelectedDrafts(prev => prev.filter(id => id !== draftToDelete));
      toast.success('Draft deleted');
    } catch (err: any) {
      console.error('Error deleting draft:', err);
      toast.error('Failed to delete draft');
    } finally {
      setShowDeleteConfirm(false);
      setDraftToDelete(null);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedDrafts.length === 0) return;
    
    try {
      await deleteDrafts(selectedDrafts);
      setDrafts(prev => prev.filter(d => !selectedDrafts.includes(d.id)));
      setSelectedDrafts([]);
      toast.success(`${selectedDrafts.length} draft${selectedDrafts.length > 1 ? 's' : ''} deleted`);
    } catch (err: any) {
      console.error('Error deleting drafts:', err);
      toast.error('Failed to delete drafts');
    }
  };

  const handlePreviewDraft = (draft: EmailDraft) => {
    setPreviewDraft(draft);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffTime / (1000 * 60));
    const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffMinutes < 1) {
      return 'Just now';
    } else if (diffMinutes < 60) {
      return `${diffMinutes}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const getPreviewText = (draft: EmailDraft) => {
    // Strip HTML tags and get first 100 characters
    const text = draft.textContent || draft.htmlContent.replace(/<[^>]*>/g, '');
    if (text.length > 100) {
      return text.substring(0, 100) + '...';
    }
    return text || '(No content)';
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

  const draftVariants = {
    initial: { opacity: 0, x: -20 },
    animate: { 
      opacity: 1, 
      x: 0,
      transition: {
        duration: 0.3,
        ease: easeOut
      }
    },
    exit: {
      opacity: 0,
      x: -20,
      height: 0,
      transition: {
        duration: 0.2,
        ease: easeOut
      }
    },
    hover: {
      backgroundColor: 'rgba(59, 130, 246, 0.05)',
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
              <FileEdit className="w-6 h-6 text-amber-600 dark:text-amber-400" />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Drafts
              </h1>
              {drafts.length > 0 && (
                <span className="px-2.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-sm font-medium rounded-full">
                  {drafts.length}
                </span>
              )}
            </div>
            <div className="flex items-center space-x-3">
              <Button
                variant="outline"
                onClick={handleRefresh}
                disabled={isLoading}
                className="flex items-center space-x-2"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </Button>
            </div>
          </div>

          {/* Info Banner */}
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 text-sm text-amber-700 dark:text-amber-300">
            <div className="flex items-center space-x-2">
              <Info className="w-4 h-4 flex-shrink-0" />
              <span>Drafts are saved locally in your browser. Once sent, they will be automatically removed.</span>
            </div>
          </div>
        </div>

        {/* Toolbar when items selected */}
        <AnimatePresence>
          {selectedDrafts.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="border-b border-gray-200 dark:border-gray-700 p-4 bg-amber-50 dark:bg-amber-900/20"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-amber-600 dark:text-amber-400">
                  {selectedDrafts.length} draft{selectedDrafts.length !== 1 ? 's' : ''} selected
                </span>
                <div className="flex items-center space-x-2">
                  <Button 
                    variant="outline" 
                    size="small" 
                    onClick={handleDeleteSelected}
                    className="flex items-center space-x-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete Selected</span>
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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
              <RefreshCw className="w-8 h-8 animate-spin text-amber-500" />
              <p className="text-gray-500 dark:text-gray-400">Loading drafts...</p>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && drafts.length === 0 && (
          <div className="p-12 text-center">
            <div className="flex flex-col items-center space-y-4">
              <FileEdit className="w-16 h-16 text-gray-300 dark:text-gray-600" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">No drafts</h3>
              <p className="text-gray-500 dark:text-gray-400">
                When you save a draft, it will appear here.
              </p>
              <Button onClick={() => navigate('/compose')}>
                Compose Email
              </Button>
            </div>
          </div>
        )}

        {/* Drafts List */}
        {!isLoading && !error && drafts.length > 0 && (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {/* Header Row */}
            <div className="p-4 bg-gray-50 dark:bg-gray-700/50">
              <div className="flex items-center space-x-4">
                <input
                  type="checkbox"
                  checked={selectedDrafts.length === drafts.length && drafts.length > 0}
                  onChange={handleSelectAll}
                  className="w-4 h-4 text-amber-600 border-gray-300 rounded focus:ring-amber-500"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Select All
                </span>
              </div>
            </div>

            {/* Draft Items */}
            <AnimatePresence mode="popLayout">
              {drafts.map((draft) => (
                <motion.div
                  key={draft.id}
                  variants={draftVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  whileHover="hover"
                  layout
                  onMouseEnter={() => setHoveredDraft(draft.id)}
                  onMouseLeave={() => setHoveredDraft(null)}
                  className="relative"
                >
                  <div className="flex items-start p-4 cursor-pointer">
                    {/* Checkbox */}
                    <div className="flex items-center pt-1">
                      <input
                        type="checkbox"
                        checked={selectedDrafts.includes(draft.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleSelectDraft(draft.id);
                        }}
                        className="w-4 h-4 text-amber-600 border-gray-300 rounded focus:ring-amber-500"
                      />
                    </div>

                    {/* Draft Content */}
                    <div 
                      className="flex-1 min-w-0 ml-4"
                      onClick={() => handleEditDraft(draft)}
                    >
                      {/* Top Row: Subject & Date */}
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                          {draft.subject || '(No Subject)'}
                        </h3>
                        <div className="flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400">
                          <Clock className="w-3 h-3" />
                          <span>{formatDate(draft.updatedAt)}</span>
                        </div>
                      </div>

                      {/* Middle Row: To Address */}
                      <div className="flex items-center space-x-2 mb-1">
                        <Mail className="w-3 h-3 text-gray-400" />
                        <span className="text-sm text-gray-600 dark:text-gray-400 truncate">
                          {draft.to || '(No recipient)'}
                        </span>
                      </div>

                      {/* Bottom Row: Preview */}
                      <p className="text-sm text-gray-500 dark:text-gray-500 line-clamp-2">
                        {getPreviewText(draft)}
                      </p>

                      {/* Attachments indicator */}
                      {draft.attachments && draft.attachments.length > 0 && (
                        <div className="flex items-center mt-2 text-xs text-gray-500 dark:text-gray-400">
                          <Paperclip className="w-3 h-3 mr-1" />
                          <span>{draft.attachments.length} attachment{draft.attachments.length !== 1 ? 's' : ''}</span>
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <AnimatePresence>
                      {hoveredDraft === draft.id && (
                        <motion.div
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 10 }}
                          className="flex items-center space-x-1 ml-2"
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePreviewDraft(draft);
                            }}
                            className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                            title="Preview"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditDraft(draft);
                            }}
                            className="p-2 text-gray-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteDraft(draft.id);
                            }}
                            className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setDraftToDelete(null);
        }}
        onConfirm={confirmDeleteDraft}
        title="Delete Draft"
        message="Are you sure you want to delete this draft? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
      />

      {/* Preview Modal */}
      <AnimatePresence>
        {previewDraft && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setPreviewDraft(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Draft Preview
                </h2>
                <button
                  onClick={() => setPreviewDraft(null)}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-6 overflow-y-auto max-h-[60vh]">
                <div className="space-y-4">
                  <div>
                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">From:</span>
                    <p className="text-gray-900 dark:text-white">{previewDraft.fromEmail || 'Not selected'}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">To:</span>
                    <p className="text-gray-900 dark:text-white">{previewDraft.to || '(No recipient)'}</p>
                  </div>
                  {previewDraft.cc && (
                    <div>
                      <span className="text-sm font-medium text-gray-500 dark:text-gray-400">CC:</span>
                      <p className="text-gray-900 dark:text-white">{previewDraft.cc}</p>
                    </div>
                  )}
                  {previewDraft.bcc && (
                    <div>
                      <span className="text-sm font-medium text-gray-500 dark:text-gray-400">BCC:</span>
                      <p className="text-gray-900 dark:text-white">{previewDraft.bcc}</p>
                    </div>
                  )}
                  <div>
                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Subject:</span>
                    <p className="text-gray-900 dark:text-white font-medium">{previewDraft.subject || '(No subject)'}</p>
                  </div>
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                    <div
                      className="ck-content email-preview max-w-none text-gray-900 dark:text-gray-100"
                      dangerouslySetInnerHTML={{ __html: previewDraft.htmlContent || '<p>(No content)</p>' }}
                    />
                  </div>
                  {previewDraft.attachments && previewDraft.attachments.length > 0 && (
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                        Attachments ({previewDraft.attachments.length})
                      </p>
                      <div className="space-y-2">
                        {previewDraft.attachments.map((attachment) => (
                          <div key={attachment.id} className="flex items-center space-x-2 text-sm">
                            <Paperclip className="w-4 h-4 text-gray-400" />
                            <span className="text-gray-900 dark:text-white">{attachment.name}</span>
                            <span className="text-gray-500">({attachment.sizeFormatted})</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="text-xs text-gray-500 dark:text-gray-400 pt-2">
                    <span>Last saved: {new Date(previewDraft.updatedAt).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 dark:border-gray-700">
                <Button
                  variant="outline"
                  onClick={() => setPreviewDraft(null)}
                >
                  Close
                </Button>
                <Button
                  onClick={() => {
                    handleEditDraft(previewDraft);
                    setPreviewDraft(null);
                  }}
                  className="flex items-center space-x-2"
                >
                  <Edit3 className="w-4 h-4" />
                  <span>Edit Draft</span>
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default DraftsPage;
