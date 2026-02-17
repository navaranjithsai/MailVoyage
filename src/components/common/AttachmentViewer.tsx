import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Download, 
  Maximize2, 
  Minimize2, 
  ChevronLeft, 
  ChevronRight,
  File,
  FileImage,
  FileText,
  FileSpreadsheet,
  FileVideo,
  FileAudio,
  FileArchive,
  FileCode,
  ExternalLink,
  Eye
} from 'lucide-react';
import { 
  base64ToBlobUrl, 
  revokeBlobUrl, 
  downloadBase64File, 
  formatFileSize,
  getFileIconType,
  canPreviewFile 
} from '@/lib/emailStyles';

export interface AttachmentData {
  filename: string;
  contentType: string;
  size: number;
  content?: string; // Base64 content
}

interface AttachmentViewerProps {
  attachments: AttachmentData[];
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
}

const AttachmentViewer: React.FC<AttachmentViewerProps> = ({
  attachments,
  initialIndex = 0,
  isOpen,
  onClose,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentAttachment = attachments[currentIndex];

  // Generate blob URL when attachment changes
  useEffect(() => {
    if (!currentAttachment?.content) {
      setError('No content available for this attachment');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const url = base64ToBlobUrl(currentAttachment.content, currentAttachment.contentType);
      if (url) {
        setBlobUrl(url);
        setIsLoading(false);
      } else {
        setError('Failed to load attachment');
        setIsLoading(false);
      }
    } catch (err) {
      console.error('Error loading attachment:', err);
      setError('Failed to load attachment');
      setIsLoading(false);
    }

    // Cleanup blob URL on unmount or when attachment changes
    return () => {
      if (blobUrl) {
        revokeBlobUrl(blobUrl);
      }
    };
  }, [currentAttachment]);

  // Reset index when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex);
    }
  }, [isOpen, initialIndex]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          if (isFullscreen) {
            setIsFullscreen(false);
          } else {
            onClose();
          }
          break;
        case 'ArrowLeft':
          navigatePrev();
          break;
        case 'ArrowRight':
          navigateNext();
          break;
        case 'f':
        case 'F':
          setIsFullscreen(prev => !prev);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isFullscreen, currentIndex, attachments.length]);

  const navigatePrev = useCallback(() => {
    setCurrentIndex(prev => (prev > 0 ? prev - 1 : attachments.length - 1));
  }, [attachments.length]);

  const navigateNext = useCallback(() => {
    setCurrentIndex(prev => (prev < attachments.length - 1 ? prev + 1 : 0));
  }, [attachments.length]);

  const handleDownload = () => {
    if (currentAttachment?.content) {
      downloadBase64File(
        currentAttachment.content,
        currentAttachment.contentType,
        currentAttachment.filename
      );
    }
  };

  const handleOpenInNewTab = () => {
    if (blobUrl) {
      window.open(blobUrl, '_blank');
    }
  };

  const getFileIcon = (contentType: string, size: 'small' | 'medium' | 'large' = 'large') => {
    const iconType = getFileIconType(contentType);
    const sizeClasses = {
      small: "w-6 h-6",
      medium: "w-8 h-8",
      large: "w-16 h-16"
    };
    const iconClass = `${sizeClasses[size]} text-gray-400`;
    
    switch (iconType) {
      case 'image': return <FileImage className={iconClass} />;
      case 'pdf': return <FileText className={iconClass} />;
      case 'document': return <FileText className={iconClass} />;
      case 'spreadsheet': return <FileSpreadsheet className={iconClass} />;
      case 'video': return <FileVideo className={iconClass} />;
      case 'audio': return <FileAudio className={iconClass} />;
      case 'archive': return <FileArchive className={iconClass} />;
      case 'code': return <FileCode className={iconClass} />;
      default: return <File className={iconClass} />;
    }
  };

  const renderPreview = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      );
    }

    if (error || !blobUrl) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
          {getFileIcon(currentAttachment?.contentType || '')}
          <p className="mt-4 text-lg font-medium">{currentAttachment?.filename}</p>
          <p className="mt-1 text-sm">{formatFileSize(currentAttachment?.size || 0)}</p>
          {error && <p className="mt-2 text-red-500 text-sm">{error}</p>}
          <button
            onClick={handleDownload}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
          >
            <Download className="w-4 h-4" />
            <span>Download</span>
          </button>
        </div>
      );
    }

    const contentType = currentAttachment?.contentType || '';

    // Image preview
    if (contentType.startsWith('image/')) {
      return (
        <img
          src={blobUrl}
          alt={currentAttachment?.filename}
          className="max-w-full max-h-full object-contain"
          onError={() => setError('Failed to load image')}
        />
      );
    }

    // PDF preview
    if (contentType === 'application/pdf') {
      return (
        <iframe
          src={blobUrl}
          className="w-full h-full border-0"
          title={currentAttachment?.filename}
        />
      );
    }

    // Video preview
    if (contentType.startsWith('video/')) {
      return (
        <video
          src={blobUrl}
          controls
          className="max-w-full max-h-full"
          onError={() => setError('Failed to load video')}
        >
          Your browser does not support video playback.
        </video>
      );
    }

    // Audio preview
    if (contentType.startsWith('audio/')) {
      return (
        <div className="flex flex-col items-center justify-center h-full">
          <FileAudio className="w-24 h-24 text-gray-400 mb-4" />
          <p className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-4">
            {currentAttachment?.filename}
          </p>
          <audio src={blobUrl} controls className="w-full max-w-md">
            Your browser does not support audio playback.
          </audio>
        </div>
      );
    }

    // Text preview
    if (contentType.startsWith('text/')) {
      return (
        <iframe
          src={blobUrl}
          className="w-full h-full border-0 bg-white dark:bg-gray-900"
          title={currentAttachment?.filename}
        />
      );
    }

    // Non-previewable file
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
        {getFileIcon(contentType)}
        <p className="mt-4 text-lg font-medium">{currentAttachment?.filename}</p>
        <p className="mt-1 text-sm">{formatFileSize(currentAttachment?.size || 0)}</p>
        <p className="mt-2 text-sm">Preview not available for this file type</p>
        <button
          onClick={handleDownload}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
        >
          <Download className="w-4 h-4" />
          <span>Download</span>
        </button>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className={`fixed inset-0 z-50 ${isFullscreen ? '' : 'p-4 md:p-8'}`}
        onClick={onClose}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
        
        {/* Modal Container */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className={`relative h-full flex flex-col bg-white dark:bg-gray-900 ${
            isFullscreen ? '' : 'rounded-xl overflow-hidden shadow-2xl max-w-6xl mx-auto'
          }`}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            <div className="flex items-center space-x-3 min-w-0 flex-1">
              <div className="shrink-0">
                {getFileIcon(currentAttachment?.contentType || '')}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white truncate">
                  {currentAttachment?.filename}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {formatFileSize(currentAttachment?.size || 0)} • {currentAttachment?.contentType}
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              {/* Navigation counter */}
              {attachments.length > 1 && (
                <span className="text-sm text-gray-500 dark:text-gray-400 mr-2">
                  {currentIndex + 1} / {attachments.length}
                </span>
              )}
              
              {/* Open in new tab */}
              {canPreviewFile(currentAttachment?.contentType || '') && blobUrl && (
                <button
                  onClick={handleOpenInNewTab}
                  className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  title="Open in new tab"
                >
                  <ExternalLink className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                </button>
              )}
              
              {/* Download */}
              <button
                onClick={handleDownload}
                className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                title="Download"
              >
                <Download className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
              
              {/* Fullscreen toggle */}
              <button
                onClick={() => setIsFullscreen(prev => !prev)}
                className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? (
                  <Minimize2 className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                ) : (
                  <Maximize2 className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                )}
              </button>
              
              {/* Close */}
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                title="Close"
              >
                <X className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
            </div>
          </div>
          
          {/* Content */}
          <div className="flex-1 relative overflow-hidden bg-gray-100 dark:bg-gray-950 flex items-center justify-center p-4">
            {renderPreview()}
            
            {/* Navigation arrows */}
            {attachments.length > 1 && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigatePrev();
                  }}
                  className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/90 dark:bg-gray-800/90 shadow-lg hover:bg-white dark:hover:bg-gray-800 transition-colors"
                  title="Previous"
                >
                  <ChevronLeft className="w-6 h-6 text-gray-700 dark:text-gray-300" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigateNext();
                  }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/90 dark:bg-gray-800/90 shadow-lg hover:bg-white dark:hover:bg-gray-800 transition-colors"
                  title="Next"
                >
                  <ChevronRight className="w-6 h-6 text-gray-700 dark:text-gray-300" />
                </button>
              </>
            )}
          </div>
          
          {/* Thumbnail strip for multiple attachments */}
          {attachments.length > 1 && (
            <div className="border-t border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-800">
              <div className="flex space-x-2 overflow-x-auto">
                {attachments.map((attachment, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentIndex(index)}
                    className={`shrink-0 w-16 h-16 rounded-lg border-2 overflow-hidden transition-all ${
                      index === currentIndex
                        ? 'border-blue-500 ring-2 ring-blue-500/30'
                        : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                    }`}
                  >
                    {attachment.contentType.startsWith('image/') && attachment.content ? (
                      <img
                        src={`data:${attachment.contentType};base64,${attachment.content}`}
                        alt={attachment.filename}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-700">
                        {getFileIcon(attachment.contentType, 'small')}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

/**
 * Attachment list item component with view and download actions
 */
interface AttachmentListItemProps {
  attachment: AttachmentData;
  onView: () => void;
  onDownload: () => void;
  compact?: boolean;
}

export const AttachmentListItem: React.FC<AttachmentListItemProps> = ({
  attachment,
  onView,
  onDownload,
  compact = false,
}) => {
  const getFileIcon = (contentType: string) => {
    const iconType = getFileIconType(contentType);
    const iconClass = compact ? "w-4 h-4" : "w-5 h-5";
    
    switch (iconType) {
      case 'image': return <FileImage className={iconClass} />;
      case 'pdf': return <FileText className={iconClass} />;
      case 'document': return <FileText className={iconClass} />;
      case 'spreadsheet': return <FileSpreadsheet className={iconClass} />;
      case 'video': return <FileVideo className={iconClass} />;
      case 'audio': return <FileAudio className={iconClass} />;
      case 'archive': return <FileArchive className={iconClass} />;
      case 'code': return <FileCode className={iconClass} />;
      default: return <File className={iconClass} />;
    }
  };

  return (
    <div className={`flex items-center justify-between ${compact ? 'p-2' : 'p-3'} bg-gray-50 dark:bg-gray-700 rounded-lg group hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors`}>
      <div className="flex items-center space-x-3 min-w-0 flex-1">
        <div className={`${compact ? 'w-8 h-8' : 'w-10 h-10'} rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0`}>
          <span className="text-blue-600 dark:text-blue-400">
            {getFileIcon(attachment.contentType)}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className={`${compact ? 'text-sm' : 'text-sm'} font-medium text-gray-900 dark:text-white truncate`}>
            {attachment.filename}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {formatFileSize(attachment.size)}
          </p>
        </div>
      </div>
      
      <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {canPreviewFile(attachment.contentType) && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onView();
            }}
            className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-500 transition-colors"
            title="View"
          >
            <Eye className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDownload();
          }}
          className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-500 transition-colors"
          title="Download"
        >
          <Download className="w-4 h-4 text-gray-600 dark:text-gray-400" />
        </button>
      </div>
    </div>
  );
};

export default AttachmentViewer;
