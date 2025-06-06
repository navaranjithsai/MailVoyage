import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Star, Archive, Trash2, Reply, Forward, MoreVertical, Paperclip, Clock, User } from 'lucide-react';
import Button from '@/components/ui/Button';

interface EmailData {
  id: number;
  sender: string;
  senderName?: string;
  senderEmail: string;
  recipient: string;
  subject: string;
  content: string;
  timestamp: string;
  date: Date;
  isRead: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  attachments?: Array<{
    id: string;
    name: string;
    size: string;
    type: string;
  }>;
  priority: 'high' | 'normal' | 'low';
  folder: string;
}

const EmailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [email, setEmail] = useState<EmailData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showActions, setShowActions] = useState(false);

  // Mock email data - replace with actual API call
  const mockEmailData: EmailData = {
    id: parseInt(id || '1'),
    sender: 'notifications@github.com',
    senderName: 'GitHub',
    senderEmail: 'notifications@github.com',
    recipient: 'user@example.com',
    subject: 'New pull request on MailVoyage repository',
    content: `Hi there,

A new pull request has been opened for review on your repository "MailVoyage".

**Pull Request Details:**
- Title: Enhanced search functionality with advanced filters
- Author: @contributor-name
- Branch: feature/search-enhancement
- Files changed: 12 files

**Summary:**
This pull request introduces comprehensive search functionality including:
- Advanced filtering by sender, subject, date range, and attachments
- Real-time search suggestions
- URL-based search parameters for bookmarkable searches
- Responsive search interface with dark/light theme support

**Changes include:**
- New SearchBar component with filter interface
- Enhanced EmailList component with search integration  
- SearchPage with URL parameter handling
- Improved routing for search functionality

You can review the changes and provide feedback directly on GitHub.

Best regards,
The GitHub Team

---
This email was sent because you are watching the MailVoyage repository. You can unsubscribe from these notifications in your GitHub settings.`,
    timestamp: '2 hours ago',
    date: new Date(Date.now() - 2 * 60 * 60 * 1000),
    isRead: false,
    isStarred: true,
    hasAttachments: true,
    attachments: [
      {
        id: '1',
        name: 'pull-request-summary.pdf',
        size: '245 KB',
        type: 'application/pdf'
      },
      {
        id: '2',
        name: 'code-changes.patch',
        size: '12 KB',
        type: 'text/plain'
      }
    ],
    priority: 'high',
    folder: 'inbox'
  };

  useEffect(() => {
    const loadEmail = async () => {
      setIsLoading(true);
      
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // In a real app, fetch email by ID from API
      setEmail(mockEmailData);
      setIsLoading(false);
    };

    if (id) {
      loadEmail();
    }
  }, [id]);

  const handleGoBack = () => {
    navigate(-1);
  };
  const handleToggleStar = () => {
    if (email) {
      setEmail({ ...email, isStarred: !email.isStarred });
    }
  };

  const handleReply = () => {
    // Navigate to compose page with reply context
    navigate('/compose', { 
      state: { 
        type: 'reply', 
        originalEmail: email 
      } 
    });
  };

  const handleForward = () => {
    // Navigate to compose page with forward context
    navigate('/compose', { 
      state: { 
        type: 'forward', 
        originalEmail: email 
      } 
    });
  };

  const handleArchive = () => {
    // Implement archive functionality
    console.log('Archive email:', email?.id);
    navigate(-1);
  };

  const handleDelete = () => {
    // Implement delete functionality
    console.log('Delete email:', email?.id);
    navigate(-1);
  };

  const formatSenderName = (senderName?: string, sender?: string) => {
    return senderName || sender?.split('@')[0] || 'Unknown';
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'text-red-500';
      case 'low':
        return 'text-gray-400';
      default:
        return 'text-blue-500';
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!email) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Email not found
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            The email you're looking for doesn't exist or has been removed.
          </p>
          <Button onClick={handleGoBack}>Go Back</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-6"
        >
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="outline"
              size="small"
              onClick={handleGoBack}
              className="flex items-center gap-2"
            >
              <ArrowLeft size={16} />
              Back
            </Button>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="small"
                onClick={handleToggleStar}
                className={email.isStarred ? 'text-yellow-500' : 'text-gray-400'}
              >
                <Star size={18} fill={email.isStarred ? 'currentColor' : 'none'} />
              </Button>
              
              <Button
                variant="ghost"
                size="small"
                onClick={handleReply}
                className="text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
              >
                <Reply size={18} />
              </Button>
              
              <Button
                variant="ghost"
                size="small"
                onClick={handleForward}
                className="text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
              >
                <Forward size={18} />
              </Button>

              <div className="relative">
                <Button
                  variant="ghost"
                  size="small"
                  onClick={() => setShowActions(!showActions)}
                  className="text-gray-600 dark:text-gray-400"
                >
                  <MoreVertical size={18} />
                </Button>

                {showActions && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10"
                  >
                    <div className="py-1">
                      <button
                        onClick={handleArchive}
                        className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                      >
                        <Archive size={16} />
                        Archive
                      </button>
                      <button
                        onClick={handleDelete}
                        className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                      >
                        <Trash2 size={16} />
                        Delete
                      </button>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Email Content */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700"
        >
          {/* Email Header */}
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start space-x-4">
                <div className="h-12 w-12 rounded-full bg-blue-500 flex items-center justify-center text-white text-lg font-medium">
                  {formatSenderName(email.senderName, email.sender).charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    {email.subject}
                  </h1>
                  <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                    <div className="flex items-center gap-1">
                      <User size={14} />
                      <span className="font-medium">{formatSenderName(email.senderName, email.sender)}</span>
                      <span className="text-gray-500">({email.senderEmail})</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock size={14} />
                      {email.timestamp}
                    </div>
                    {email.priority !== 'normal' && (
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(email.priority)} bg-opacity-10`}>
                        {email.priority} priority
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Attachments */}
            {email.hasAttachments && email.attachments && (
              <div className="mt-4">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1">
                  <Paperclip size={14} />
                  Attachments ({email.attachments.length})
                </h3>
                <div className="space-y-2">
                  {email.attachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                          <Paperclip size={16} className="text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {attachment.name}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {attachment.size}
                          </p>
                        </div>
                      </div>
                      <Button variant="outline" size="small">
                        Download
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Email Body */}
          <div className="p-6">
            <div className="prose dark:prose-invert max-w-none">
              <pre className="whitespace-pre-wrap font-sans text-gray-900 dark:text-gray-100 leading-relaxed">
                {email.content}
              </pre>
            </div>
          </div>

          {/* Action Footer */}
          <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750 rounded-b-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button onClick={handleReply} className="flex items-center gap-2">
                  <Reply size={16} />
                  Reply
                </Button>
                <Button variant="outline" onClick={handleForward} className="flex items-center gap-2">
                  <Forward size={16} />
                  Forward
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={handleArchive} className="flex items-center gap-2">
                  <Archive size={16} />
                  Archive
                </Button>
                <Button variant="ghost" onClick={handleDelete} className="text-red-600 hover:text-red-700 flex items-center gap-2">
                  <Trash2 size={16} />
                  Delete
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default EmailPage;