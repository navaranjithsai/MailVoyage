import React, { useState, useMemo, useCallback, memo, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Mail, MailOpen, Star, Clock, ChevronDown, Paperclip, AlertCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useEmail, Email } from '@/contexts/EmailContext';
import { SearchFilters } from './SearchBar';

// Email item height for virtual scrolling (approximate)
const EMAIL_ITEM_HEIGHT = 100;

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
  useVirtualScroll?: boolean;
  maxHeight?: number;
}

const EmailList: React.FC<EmailListProps> = ({
  folder = 'inbox',
  searchQuery = '',
  searchFilters = {},
  limit = 5,
  showPagination = false,
  onLoadMore,
  useVirtualScroll = false,
  maxHeight = 600
}) => {
  const { emails, markAsRead, toggleEmailStarred } = useEmail();
  const [currentPage, setCurrentPage] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(maxHeight);
  const [scrollTop, setScrollTop] = useState(0);

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

  // Virtual scrolling calculations
  const { visibleEmails, offsetY, totalHeight, startIndex } = useMemo(() => {
    if (!useVirtualScroll) {
      return { 
        visibleEmails: paginatedEmails, 
        offsetY: 0, 
        totalHeight: 0,
        startIndex: 0 
      };
    }

    const overscan = 3;
    const totalHeight = filteredEmails.length * EMAIL_ITEM_HEIGHT;
    
    const visibleStart = Math.floor(scrollTop / EMAIL_ITEM_HEIGHT);
    const visibleCount = Math.ceil(containerHeight / EMAIL_ITEM_HEIGHT);
    
    const startIdx = Math.max(0, visibleStart - overscan);
    const endIdx = Math.min(filteredEmails.length - 1, visibleStart + visibleCount + overscan);
    
    const visibleEmails = filteredEmails.slice(startIdx, endIdx + 1);
    const offsetY = startIdx * EMAIL_ITEM_HEIGHT;

    return { visibleEmails, offsetY, totalHeight, startIndex: startIdx };
  }, [useVirtualScroll, filteredEmails, paginatedEmails, scrollTop, containerHeight]);

  // Handle scroll for virtual list
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Update container height on resize
  useEffect(() => {
    if (!useVirtualScroll || !containerRef.current) return;

    const updateHeight = () => {
      if (containerRef.current) {
        setContainerHeight(containerRef.current.clientHeight || maxHeight);
      }
    };

    updateHeight();

    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(containerRef.current);

    return () => resizeObserver.disconnect();
  }, [useVirtualScroll, maxHeight]);

  const handleLoadMore = () => {
    if (onLoadMore) {
      onLoadMore();
    } else {
      setCurrentPage(prev => prev + 1);
    }
  };

  const handleEmailClick = useCallback((emailId: string) => {
    markAsRead(emailId);
    // Navigate to email detail page (using window.location for now)
    window.location.href = `/email/${emailId}`;
  }, [markAsRead]);

  const handleStarClick = useCallback((e: React.MouseEvent, emailId: string) => {
    e.stopPropagation();
    toggleEmailStarred(emailId);
  }, [toggleEmailStarred]);

  if (filteredEmails.length === 0) {
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

  // Virtual scroll rendering
  if (useVirtualScroll) {
    return (
      <div className="space-y-4">
        <div
          ref={containerRef}
          className="overflow-auto"
          style={{ height: maxHeight }}
          onScroll={handleScroll}
        >
          <div style={{ height: totalHeight, position: 'relative' }}>
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                transform: `translateY(${offsetY}px)`
              }}
            >
              {visibleEmails.map((email, idx) => (
                <EmailItem
                  key={email.id}
                  email={email}
                  index={startIndex + idx}
                  onClick={handleEmailClick}
                  onStarClick={handleStarClick}
                  style={{ height: EMAIL_ITEM_HEIGHT }}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400 text-center">
          Showing {filteredEmails.length} emails
        </div>
      </div>
    );
  }

  // Standard pagination rendering
  const displayEmails = useVirtualScroll ? visibleEmails : paginatedEmails;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {displayEmails.map((email, index) => (
          <EmailItem
            key={email.id}
            email={email}
            index={index}
            onClick={handleEmailClick}
            onStarClick={handleStarClick}
            animate
          />
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

// Memoized Email Item Component
interface EmailItemProps {
  email: Email;
  index: number;
  onClick: (id: string) => void;
  onStarClick: (e: React.MouseEvent, id: string) => void;
  style?: React.CSSProperties;
  animate?: boolean;
}

const EmailItem = memo(function EmailItem({ 
  email, 
  index, 
  onClick, 
  onStarClick,
  style,
  animate = false
}: EmailItemProps) {
  const formatSenderName = (senderName?: string, sender?: string) => {
    return senderName || sender?.split('@')[0] || 'Unknown';
  };

  const content = (
    <div
      className={`
        group cursor-pointer border rounded-lg p-4 transition-all duration-200 hover:shadow-md
        ${email.isRead 
          ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700' 
          : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
        }
        hover:bg-gray-50 dark:hover:bg-gray-700/50
      `}
      style={style}
      onClick={() => onClick(email.id)}
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
                  {email.time}
                </span>
                <button
                  onClick={(e) => onStarClick(e, email.id)}
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
    </div>
  );

  if (animate) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: Math.min(index * 0.05, 0.5), duration: 0.3 }}
      >
        {content}
      </motion.div>
    );
  }

  return content;
});

export default EmailList;
