import React, { useState } from 'react';
import { motion, easeOut } from 'framer-motion';
import { 
  Search, 
  Filter, 
  Star, 
  Paperclip, 
  Archive, 
  Trash2, 
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  RefreshCw
} from 'lucide-react';
import Button from '@/components/ui/Button';
import { useEmail } from '@/contexts/EmailContext';

const InboxPage: React.FC = () => {
  const { emails, refreshEmails } = useEmail();
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleSelectEmail = (emailId: string) => {
    setSelectedEmails(prev => 
      prev.includes(emailId) 
        ? prev.filter(id => id !== emailId)
        : [...prev, emailId]
    );
  };

  const handleSelectAll = () => {
    setSelectedEmails(
      selectedEmails.length === emails.length ? [] : emails.map(email => email.id)
    );
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshEmails();
    setIsRefreshing(false);
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

  const emailVariants = {
    initial: { opacity: 0, x: -20 },
    animate: { 
      opacity: 1, 
      x: 0,
      transition: {
        duration: 0.3,
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
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Inbox
            </h1>
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

          {/* Search and Filters */}
          <div className="flex items-center space-x-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search emails..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              />
            </div>
            <Button variant="outline" className="flex items-center space-x-2">
              <Filter className="w-4 h-4" />
              <span>Filter</span>
            </Button>
          </div>
        </div>

        {/* Toolbar */}
        {selectedEmails.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="border-b border-gray-200 dark:border-gray-700 p-4 bg-blue-50 dark:bg-blue-900/20"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-blue-600 dark:text-blue-400">
                {selectedEmails.length} email{selectedEmails.length !== 1 ? 's' : ''} selected
              </span>
              <div className="flex items-center space-x-2">
                <Button variant="outline" size="small" className="flex items-center space-x-1">
                  <Archive className="w-4 h-4" />
                  <span>Archive</span>
                </Button>
                <Button variant="outline" size="small" className="flex items-center space-x-1 text-red-600">
                  <Trash2 className="w-4 h-4" />
                  <span>Delete</span>
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Email List */}
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {/* Header Row */}
          <div className="p-4 bg-gray-50 dark:bg-gray-700/50">
            <div className="flex items-center space-x-4">
              <input
                type="checkbox"
                checked={selectedEmails.length === emails.length}
                onChange={handleSelectAll}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <div className="flex-1 grid grid-cols-12 gap-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                <div className="col-span-3">Sender</div>
                <div className="col-span-6">Subject</div>
                <div className="col-span-2">Time</div>
                <div className="col-span-1"></div>
              </div>
            </div>
          </div>

          {/* Email Rows */}
          {emails.map((email, index) => (
            <motion.div
              key={email.id}
              variants={emailVariants}
              initial="initial"
              animate="animate"
              whileHover="hover"
              transition={{ delay: index * 0.05 }}
              className={`
                p-4 cursor-pointer
                ${!email.isRead ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}
                ${selectedEmails.includes(email.id) ? 'bg-blue-100 dark:bg-blue-900/20' : ''}
              `}
              onClick={() => handleSelectEmail(email.id)}
            >
              <div className="flex items-center space-x-4">
                <input
                  type="checkbox"
                  checked={selectedEmails.includes(email.id)}
                  onChange={() => handleSelectEmail(email.id)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  onClick={(e) => e.stopPropagation()}
                />
                
                <div className="flex-1 grid grid-cols-12 gap-4">
                  {/* Sender */}
                  <div className="col-span-3 flex items-center space-x-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        // Toggle star
                      }}
                      className={`
                        p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600
                        ${email.isStarred ? 'text-yellow-500' : 'text-gray-400'}
                      `}
                    >
                      <Star className={`w-4 h-4 ${email.isStarred ? 'fill-current' : ''}`} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm truncate ${!email.isRead ? 'font-semibold' : 'font-medium'} text-gray-900 dark:text-white`}>
                        {email.sender}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {email.senderEmail}
                      </p>
                    </div>
                  </div>

                  {/* Subject and Preview */}
                  <div className="col-span-6 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <p className={`text-sm truncate ${!email.isRead ? 'font-semibold' : 'font-medium'} text-gray-900 dark:text-white`}>
                        {email.subject}
                      </p>
                      {email.hasAttachments && (
                        <Paperclip className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      )}
                      {email.isImportant && (
                        <div className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {email.preview}
                    </p>
                  </div>

                  {/* Time */}
                  <div className="col-span-2 flex items-center">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {email.time}
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
              Showing 1-{emails.length} of 25 emails
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
                Page {currentPage}
              </span>
              <Button
                variant="outline"
                size="small"
                onClick={() => setCurrentPage(prev => prev + 1)}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default InboxPage;
