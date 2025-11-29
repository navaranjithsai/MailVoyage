import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Star, Archive, Trash2, Reply, Forward, MoreVertical, Paperclip, Clock, User, Send, Eye, Download } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useEmail, Email } from '@/contexts/EmailContext';
import { apiFetch } from '@/lib/apiFetch';
import {
  smartGetSentMail,
  cacheSentMail,
  markThreadFetched,
  type CachedSentMailDetail,
} from '@/lib/mailCache';
import { injectEmailStyles, sanitizeEmailHtml, formatFileSize } from '@/lib/emailStyles';
import AttachmentViewer, { AttachmentData } from '@/components/common/AttachmentViewer';

// Global map to track in-progress fetches - prevents duplicate API calls across mounts
const fetchInProgress = new Map<string, Promise<any>>();

// Import CKEditor styles for consistent rendering
import 'ckeditor5/ckeditor5.css';

// Type for attachment with content
interface AttachmentWithContent {
  filename: string;
  contentType: string;
  size: number;
  content?: string;
}

// Type for sent mail from API
interface SentMailDetail {
  id: string;
  threadId: string;
  fromEmail: string;
  toEmails: string[];
  cc: string[] | null;
  bcc: string[] | null;
  subject: string;
  htmlBody: string | null;
  textBody: string | null;
  attachmentsMetadata: AttachmentWithContent[] | null;
  messageId: string | null;
  status: 'pending' | 'sent' | 'failed';
  sentAt: string;
  createdAt: string;
}

const EmailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { emails, markAsRead, toggleEmailStarred, deleteEmail } = useEmail();
  const [email, setEmail] = useState<Email | null>(null);
  const [sentMail, setSentMail] = useState<SentMailDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showActions, setShowActions] = useState(false);
  
  // Attachment viewer state
  const [selectedAttachment, setSelectedAttachment] = useState<AttachmentWithContent | null>(null);
  const [showAttachmentViewer, setShowAttachmentViewer] = useState(false);
  
  // Inline images from HTML content
  const [inlineImages, setInlineImages] = useState<AttachmentData[]>([]);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  
  // Email content container ref for adding click handlers to images
  const emailContentRef = useRef<HTMLDivElement>(null);
  
  // Abort controller for cleanup
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Determine email type from query param
  const emailType = searchParams.get('type') || 'inbox';
  
  // Memoize the current load ID to prevent unnecessary re-renders
  const currentLoadId = useMemo(() => `${emailType}-${id}`, [emailType, id]);

  // Inject email styles on mount
  useEffect(() => {
    injectEmailStyles();
  }, []);

  // Extract base64 images from HTML content
  const extractBase64Images = useCallback((htmlContent: string): AttachmentData[] => {
    const images: AttachmentData[] = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    const imgElements = doc.querySelectorAll('img[src^="data:"]');
    
    imgElements.forEach((img, index) => {
      const src = img.getAttribute('src');
      if (src && src.startsWith('data:')) {
        // Parse data URL: data:image/png;base64,xxxxx
        const matches = src.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          const contentType = matches[1];
          const base64Content = matches[2];
          const alt = img.getAttribute('alt') || `Image ${index + 1}`;
          
          // Calculate approximate size from base64 length
          const size = Math.ceil((base64Content.length * 3) / 4);
          
          images.push({
            filename: alt.endsWith('.jpg') || alt.endsWith('.png') || alt.endsWith('.gif') 
              ? alt 
              : `${alt}.${contentType.split('/')[1] || 'png'}`,
            contentType,
            size,
            content: base64Content,
          });
        }
      }
    });
    
    return images;
  }, []);

  // Handle click on inline base64 image
  const handleInlineImageClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    
    // Check if clicked on an image with data: src
    if (target.tagName === 'IMG') {
      const img = target as HTMLImageElement;
      const src = img.getAttribute('src');
      
      if (src?.startsWith('data:')) {
        e.preventDefault();
        e.stopPropagation();
        
        // Parse the data URL
        const matches = src.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          const contentType = matches[1];
          const base64Content = matches[2];
          const alt = img.getAttribute('alt') || 'Image';
          const size = Math.ceil((base64Content.length * 3) / 4);
          
          const imageData: AttachmentData = {
            filename: alt.endsWith('.jpg') || alt.endsWith('.png') || alt.endsWith('.gif') 
              ? alt 
              : `${alt}.${contentType.split('/')[1] || 'png'}`,
            contentType,
            size,
            content: base64Content,
          };
          
          // Get all images to enable navigation
          if (sentMail?.htmlBody) {
            const allImages = extractBase64Images(sentMail.htmlBody);
            // Find the index of this image by matching content
            const imageIndex = allImages.findIndex(img => img.content === base64Content);
            
            if (imageIndex !== -1) {
              setInlineImages(allImages);
              setSelectedImageIndex(imageIndex);
            } else {
              setInlineImages([imageData]);
              setSelectedImageIndex(0);
            }
          } else {
            setInlineImages([imageData]);
            setSelectedImageIndex(0);
          }
          
          setSelectedAttachment(null);
          setShowAttachmentViewer(true);
        }
      }
    }
  }, [sentMail?.htmlBody, extractBase64Images]);

  useEffect(() => {
    // Skip if no ID is provided
    if (!id) {
      setIsLoading(false);
      return;
    }
    
    // Create abort controller for this effect
    abortControllerRef.current = new AbortController();
    const { signal } = abortControllerRef.current;
    
    const loadSentMail = async (): Promise<SentMailDetail | null> => {
      // Check if there's already a fetch in progress for this email
      const existingFetch = fetchInProgress.get(currentLoadId);
      if (existingFetch) {
        // Wait for the existing fetch to complete instead of starting a new one
        return existingFetch;
      }
      
      // Create the fetch promise
      const fetchPromise = (async () => {
        try {
          // First, check the smart cache (session + IndexedDB)
          const cacheResult = await smartGetSentMail(id);
          
          if (cacheResult.data) {
            return cacheResult.data as SentMailDetail;
          }
          
          // No cache available, fetch from API
          const response = await apiFetch(`/api/sent-mails/thread/${id}`);
          
          if (response.success && response.data) {
            const mailData = response.data as SentMailDetail;
            
            // Cache in background
            cacheSentMail(mailData as CachedSentMailDetail).catch(console.error);
            markThreadFetched(id);
            
            return mailData;
          }
          
          return null;
        } finally {
          // Clean up the in-progress tracker
          fetchInProgress.delete(currentLoadId);
        }
      })();
      
      // Store the promise to prevent duplicate fetches
      fetchInProgress.set(currentLoadId, fetchPromise);
      
      return fetchPromise;
    };
    
    const loadInboxMail = (): Email | null => {
      return emails.find(e => e.id === id) || null;
    };
    
    const loadEmail = async () => {
      // Check if component was unmounted
      if (signal.aborted) return;
      
      setIsLoading(true);
      
      try {
        if (emailType === 'sent') {
          const mailData = await loadSentMail();
          
          if (signal.aborted) return;
          
          if (mailData) {
            setSentMail(mailData);
            setEmail(null);
          } else {
            setSentMail(null);
          }
        } else {
          const foundEmail = loadInboxMail();
          
          if (signal.aborted) return;
          
          if (foundEmail) {
            setEmail(foundEmail);
            setSentMail(null);
            markAsRead(foundEmail.id);
          } else {
            setEmail(null);
          }
        }
      } catch (error) {
        console.error('Error loading email:', error);
        if (!signal.aborted) {
          setSentMail(null);
          setEmail(null);
        }
      } finally {
        if (!signal.aborted) {
          setIsLoading(false);
        }
      }
    };
    
    loadEmail();
    
    // Cleanup function
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [id, emailType, currentLoadId, emails, markAsRead]);

  const handleGoBack = () => {
    navigate(-1);
  };

  const handleToggleStar = () => {
    if (email) {
      toggleEmailStarred(email.id);
      setEmail({ ...email, isStarred: !email.isStarred });
    }
  };

  const handleDelete = () => {
    if (email) {
      deleteEmail(email.id);
      navigate('/inbox');
    }
    // TODO: Implement delete for sent mails
  };

  const handleReply = () => {
    // Navigate to compose page with reply context
    if (sentMail) {
      navigate('/compose', { 
        state: { 
          type: 'reply', 
          originalEmail: {
            subject: sentMail.subject,
            senderEmail: sentMail.toEmails[0],
            content: sentMail.textBody || sentMail.htmlBody,
          }
        } 
      });
    } else if (email) {
      navigate('/compose', { 
        state: { 
          type: 'reply', 
          originalEmail: email 
        } 
      });
    }
  };

  const handleForward = () => {
    // Navigate to compose page with forward context
    if (sentMail) {
      navigate('/compose', { 
        state: { 
          type: 'forward', 
          originalEmail: {
            subject: sentMail.subject,
            content: sentMail.textBody || sentMail.htmlBody,
          }
        } 
      });
    } else if (email) {
      navigate('/compose', { 
        state: { 
          type: 'forward', 
          originalEmail: email 
        } 
      });
    }
  };

  const handleArchive = () => {
    // Implement archive functionality
    console.log('Archive email:', email?.id || sentMail?.id);
    navigate(-1);
  };

  const formatSenderName = (senderName?: string, sender?: string) => {
    return senderName || sender?.split('@')[0] || 'Unknown';
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'high':
        return 'text-red-500';
      case 'low':
        return 'text-gray-400';
      default:
        return 'text-blue-500';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString([], {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Handle opening attachment in viewer
  const handleOpenAttachment = (attachment: AttachmentWithContent) => {
    setSelectedAttachment(attachment);
    setShowAttachmentViewer(true);
  };

  // Handle downloading attachment
  const handleDownloadAttachment = (attachment: AttachmentWithContent) => {
    if (!attachment.content) {
      console.error('No content available for download');
      return;
    }
    
    try {
      // Decode base64 and create blob
      const byteCharacters = atob(attachment.content);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: attachment.contentType });
      
      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading attachment:', error);
    }
  };

  // Close attachment viewer
  const handleCloseAttachmentViewer = () => {
    setShowAttachmentViewer(false);
    setSelectedAttachment(null);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!email && !sentMail) {
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

  // Render sent mail view
  if (sentMail) {
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
                Back to Sent
              </Button>

              {/* Action buttons */}
              <div className="flex items-center gap-2">
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

          {/* Sent Email Content */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.3 }}
            className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700"
          >
            {/* Sent Badge */}
            <div className="px-6 pt-4">
              <div className="inline-flex items-center px-3 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-sm">
                <Send size={14} className="mr-2" />
                Sent Mail
              </div>
            </div>

            {/* Email Header */}
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start space-x-4">
                  <div className="h-12 w-12 rounded-full bg-green-500 flex items-center justify-center text-white text-lg font-medium">
                    <Send size={20} />
                  </div>
                  <div className="flex-1">
                    <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                      {sentMail.subject || '(No Subject)'}
                    </h1>
                    <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                      <div className="flex items-center gap-1">
                        <span className="text-gray-500">From:</span>
                        <span className="font-medium">{sentMail.fromEmail}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-500">To:</span>
                        <span className="font-medium">{sentMail.toEmails.join(', ')}</span>
                      </div>
                      {sentMail.cc && sentMail.cc.length > 0 && (
                        <div className="flex items-center gap-1">
                          <span className="text-gray-500">CC:</span>
                          <span>{sentMail.cc.join(', ')}</span>
                        </div>
                      )}
                      {sentMail.bcc && sentMail.bcc.length > 0 && (
                        <div className="flex items-center gap-1">
                          <span className="text-gray-500">BCC:</span>
                          <span>{sentMail.bcc.join(', ')}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <Clock size={14} />
                        {formatDate(sentMail.sentAt)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Attachments */}
              {sentMail.attachmentsMetadata && sentMail.attachmentsMetadata.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1">
                    <Paperclip size={14} />
                    Attachments ({sentMail.attachmentsMetadata.length})
                  </h3>
                  <div className="space-y-2">
                    {sentMail.attachmentsMetadata.map((attachment, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                            <Paperclip size={16} className="text-blue-600 dark:text-blue-400" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {attachment.filename}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {formatFileSize(attachment.size, attachment.content)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {attachment.content && (
                            <Button
                              variant="outline"
                              size="small"
                              onClick={() => handleOpenAttachment(attachment)}
                              className="flex items-center gap-1"
                            >
                              <Eye size={14} />
                              Open
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="small"
                            onClick={() => handleDownloadAttachment(attachment)}
                            disabled={!attachment.content}
                            className="flex items-center gap-1"
                          >
                            <Download size={14} />
                            Download
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Email Body */}
            <div className="p-6">
              {sentMail.htmlBody ? (
                <div 
                  ref={emailContentRef}
                  className="ck-content email-content"
                  onClick={handleInlineImageClick}
                  dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(sentMail.htmlBody) }}
                />
              ) : (
                <div className="ck-content email-content">
                  <pre className="whitespace-pre-wrap font-sans text-gray-900 dark:text-gray-100 leading-relaxed">
                    {sentMail.textBody || '(No content)'}
                  </pre>
                </div>
              )}
            </div>

            {/* Action Footer */}
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750 rounded-b-lg">
              <div className="flex items-center justify-end">
                <Button variant="outline" onClick={handleForward} className="flex items-center gap-2">
                  <Forward size={16} />
                  Forward
                </Button>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Attachment Viewer Modal - for regular attachments */}
        {selectedAttachment && showAttachmentViewer && (
          <AttachmentViewer
            attachments={[{
              filename: selectedAttachment.filename,
              contentType: selectedAttachment.contentType,
              content: selectedAttachment.content || '',
              size: selectedAttachment.size
            }]}
            initialIndex={0}
            isOpen={showAttachmentViewer}
            onClose={handleCloseAttachmentViewer}
          />
        )}

        {/* Attachment Viewer Modal - for inline images in HTML content */}
        {!selectedAttachment && inlineImages.length > 0 && showAttachmentViewer && (
          <AttachmentViewer
            attachments={inlineImages}
            initialIndex={selectedImageIndex}
            isOpen={showAttachmentViewer}
            onClose={handleCloseAttachmentViewer}
          />
        )}
      </div>
    );
  }

  // At this point, we know email is not null (sentMail case was handled above)
  // TypeScript needs explicit help with this
  if (!email) {
    return null; // This should never happen, but satisfies TypeScript
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
                      {email.time}
                    </div>
                    {email.priority && email.priority !== 'normal' && (
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
            <div className="ck-content email-content max-w-none">
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