import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Mail, MailOpen, Star, Clock, ChevronDown, Paperclip, AlertCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import { SearchFilters } from './SearchBar';

interface Email {
  id: number;
  sender: string;
  senderName?: string;
  subject: string;
  preview: string;
  timestamp: string;
  isRead: boolean;
  isStarred?: boolean;
  hasAttachments?: boolean;
  priority?: 'high' | 'normal' | 'low';
  folder?: string;
  date?: Date;
}

interface EmailListProps {
  folder?: string;
  searchQuery?: string;
  searchFilters?: SearchFilters;
  showFilters?: boolean;
  isSearching?: boolean;
  limit?: number;
  showPagination?: boolean;
  onLoadMore?: () => void;
  title?: string;
}

const generateMockEmails = (): Email[] => [
  {
    id: 1,
    sender: 'notifications@github.com',
    senderName: 'GitHub',
    subject: 'New pull request on MailVoyage',
    preview: 'A new pull request has been opened for review on your repository...',
    timestamp: '2 hours ago',
    date: new Date(Date.now() - 2 * 60 * 60 * 1000),
    isRead: false,
    isStarred: true,
    hasAttachments: false,
    priority: 'high',
    folder: 'inbox'
  },
  {
    id: 2,
    sender: 'team@mailchimp.com',
    senderName: 'Mailchimp',
    subject: 'Your monthly email campaign report',
    preview: 'Here\'s how your recent email campaigns performed...',
    timestamp: '4 hours ago',
    date: new Date(Date.now() - 4 * 60 * 60 * 1000),
    isRead: true,
    isStarred: false,
    hasAttachments: true,
    priority: 'normal',
    folder: 'inbox'
  },
  {
    id: 3,
    sender: 'support@stripe.com',
    senderName: 'Stripe',
    subject: 'Payment confirmed',
    preview: 'Your payment of $29.99 has been successfully processed...',
    timestamp: '1 day ago',
    date: new Date(Date.now() - 24 * 60 * 60 * 1000),
    isRead: true,
    isStarred: false,
    hasAttachments: false,
    priority: 'normal',
    folder: 'inbox'
  },
  {
    id: 4,
    sender: 'newsletter@techcrunch.com',
    senderName: 'TechCrunch',
    subject: 'Weekly tech roundup',
    preview: 'The latest news and trends in technology this week...',
    timestamp: '2 days ago',
    date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    isRead: false,
    isStarred: true,
    hasAttachments: false,
    priority: 'low',
    folder: 'inbox'
  },
  {
    id: 5,
    sender: 'alerts@aws.amazon.com',
    senderName: 'AWS',
    subject: 'EC2 instance alert',
    preview: 'High CPU usage detected on your EC2 instance...',
    timestamp: '3 days ago',
    date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    isRead: false,
    isStarred: false,
    hasAttachments: true,
    priority: 'high',
    folder: 'inbox'
  }
];

const EmailList: React.FC<EmailListProps> = ({
  folder = 'inbox',
  searchQuery = '',
  searchFilters = {},
  limit = 5,
  showPagination = false,
  onLoadMore
}) => {
  const [emails, setEmails] = useState<Email[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  const filteredEmails = useMemo(() => {
    let filtered = [...emails];

    if (folder && folder !== 'all') {
      filtered = filtered.filter(email => email.folder === folder);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(email =>
        email.subject.toLowerCase().includes(query) ||
        email.preview.toLowerCase().includes(query) ||
        email.sender.toLowerCase().includes(query) ||
        email.senderName?.toLowerCase().includes(query)
      );
    }

    if (searchFilters.from) {
      filtered = filtered.filter(email =>
        email.sender.toLowerCase().includes(searchFilters.from!.toLowerCase()) ||
        email.senderName?.toLowerCase().includes(searchFilters.from!.toLowerCase())
      );
    }

    if (searchFilters.hasAttachments !== undefined) {
      filtered = filtered.filter(email => email.hasAttachments === searchFilters.hasAttachments);
    }

    if (searchFilters.isUnread !== undefined) {
      filtered = filtered.filter(email => !email.isRead === searchFilters.isUnread);
    }

    if (searchFilters.isStarred !== undefined) {
      filtered = filtered.filter(email => email.isStarred === searchFilters.isStarred);
    }

    if (searchFilters.priority) {
      filtered = filtered.filter(email => email.priority === searchFilters.priority);
    }

    return filtered;
  }, [emails, searchQuery, searchFilters, folder]);

  const paginatedEmails = useMemo(() => {
    const itemsToShow = showPagination ? currentPage * limit : limit;
    return filteredEmails.slice(0, itemsToShow);
  }, [filteredEmails, currentPage, limit, showPagination]);

  const hasMore = filteredEmails.length > paginatedEmails.length;

  const loadEmails = async () => {
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    const mockEmails = generateMockEmails();
    setEmails(mockEmails);
    setIsLoading(false);
  };

  useEffect(() => {
    loadEmails();
  }, []);

  const toggleStarred = (emailId: number) => {
    setEmails(prevEmails => 
      prevEmails.map(email => 
        email.id === emailId 
          ? { ...email, isStarred: !email.isStarred }
          : email
      )
    );
  };

  const markAsRead = (emailId: number) => {
    setEmails(prevEmails => 
      prevEmails.map(email => 
        email.id === emailId 
          ? { ...email, isRead: true }
          : email
      )
    );
  };

  const formatSenderName = (senderName?: string, sender?: string) => {
    return senderName || sender?.split('@')[0] || 'Unknown';
  };

  const handleLoadMore = () => {
    if (onLoadMore) {
      onLoadMore();
    } else {
      setCurrentPage(prev => prev + 1);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="animate-pulse">
            <div className="flex items-center space-x-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
              <div className="h-10 w-10 bg-gray-300 dark:bg-gray-600 rounded-full"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-3/4"></div>
                <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-1/2"></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (paginatedEmails.length === 0) {
    return (
      <div className="text-center py-12">
        <Mail className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-600 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
          No emails found
        </h3>
        <p className="text-gray-500 dark:text-gray-400">
          Your inbox is empty. New emails will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {paginatedEmails.map((email, index) => (
          <motion.div
            key={email.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1, duration: 0.3 }}
            className={`
              group cursor-pointer border rounded-lg p-4 transition-all duration-200 hover:shadow-md
              ${email.isRead 
                ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700' 
                : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
              }
              hover:bg-gray-50 dark:hover:bg-gray-700/50
            `}
            onClick={() => markAsRead(email.id)}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-3 flex-1 min-w-0">
                <div className={`
                  flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center text-white text-sm font-medium
                  ${email.isRead ? 'bg-gray-400 dark:bg-gray-600' : 'bg-blue-500 dark:bg-blue-600'}
                `}>
                  {formatSenderName(email.senderName, email.sender).charAt(0).toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center space-x-2">
                      <h4 className={`
                        text-sm truncate
                        ${email.isRead 
                          ? 'text-gray-700 dark:text-gray-300 font-medium' 
                          : 'text-gray-900 dark:text-gray-100 font-semibold'
                        }
                      `}>
                        {formatSenderName(email.senderName, email.sender)}
                      </h4>
                      {!email.isRead && (
                        <div className="h-2 w-2 bg-blue-500 rounded-full"></div>
                      )}
                      {email.priority === 'high' && (
                        <AlertCircle size={14} className="text-red-500" />
                      )}
                      {email.hasAttachments && (
                        <Paperclip size={14} className="text-gray-400 dark:text-gray-500" />
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                        <Clock size={12} className="mr-1" />
                        {email.timestamp}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleStarred(email.id);
                        }}
                        className={`
                          p-1 rounded transition-colors
                          ${email.isStarred 
                            ? 'text-yellow-500 hover:text-yellow-600' 
                            : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'
                          }
                        `}
                      >
                        <Star size={16} fill={email.isStarred ? 'currentColor' : 'none'} />
                      </button>
                    </div>
                  </div>

                  <h5 className={`
                    text-sm mb-1 truncate
                    ${email.isRead 
                      ? 'text-gray-600 dark:text-gray-400' 
                      : 'text-gray-800 dark:text-gray-200 font-medium'
                    }
                  `}>
                    {email.subject}
                  </h5>

                  <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">
                    {email.preview}
                  </p>
                </div>
              </div>

              <div className="flex flex-col items-center space-y-1 ml-2">
                {email.isRead ? (
                  <MailOpen size={16} className="text-gray-400 dark:text-gray-500" />
                ) : (
                  <Mail size={16} className="text-blue-500 dark:text-blue-400" />
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {hasMore && showPagination && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-center py-4 border-t border-gray-200 dark:border-gray-700"
        >
          <Button
            variant="outline"
            size="small"
            onClick={handleLoadMore}
            className="flex items-center gap-2"
          >
            <ChevronDown size={16} />
            Show more emails
          </Button>
        </motion.div>
      )}
    </div>
  );
};

export default EmailList;
