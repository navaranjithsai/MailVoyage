import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Send, 
  Paperclip, 
  Bold, 
  Italic, 
  Underline, 
  Link2, 
  Image, 
  Smile,
  X,
  Save,
  Eye
} from 'lucide-react';
import Button from '@/components/ui/Button';
import { toast } from '@/lib/toast';

interface Attachment {
  id: string;
  name: string;
  size: string;
  type: string;
}

const ComposePage: React.FC = () => {
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [isPreview, setIsPreview] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const handleSend = async () => {
    if (!to.trim() || !subject.trim() || !content.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSending(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      toast.success('Email sent successfully!');
      
      // Reset form
      setTo('');
      setCc('');
      setBcc('');
      setSubject('');
      setContent('');
      setAttachments([]);
    } catch (error) {
      toast.error('Failed to send email');
    } finally {
      setIsSending(false);
    }
  };

  const handleSaveDraft = () => {
    toast.success('Draft saved');
  };

  const handleAttachment = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const newAttachments: Attachment[] = Array.from(files).map(file => ({
        id: Math.random().toString(36).substr(2, 9),
        name: file.name,
        size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
        type: file.type,
      }));
      setAttachments([...attachments, ...newAttachments]);
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments(attachments.filter(att => att.id !== id));
  };

  const pageVariants = {
    initial: { opacity: 0, y: 20 },
    animate: { 
      opacity: 1, 
      y: 0,
      transition: {
        duration: 0.4,
        ease: 'easeOut'
      }
    },
  };

  return (
    <motion.div
      className="max-w-4xl mx-auto"
      variants={pageVariants}
      initial="initial"
      animate="animate"
    >
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
        {/* Header */}
        <div className="border-b border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Compose Email
            </h1>
            <div className="flex items-center space-x-3">
              <Button
                variant="outline"
                onClick={() => setIsPreview(!isPreview)}
                className="flex items-center space-x-2"
              >
                <Eye className="w-4 h-4" />
                <span>{isPreview ? 'Edit' : 'Preview'}</span>
              </Button>
              <Button
                variant="outline"
                onClick={handleSaveDraft}
                className="flex items-center space-x-2"
              >
                <Save className="w-4 h-4" />
                <span>Save Draft</span>
              </Button>
            </div>
          </div>
        </div>

        {isPreview ? (
          /* Preview Mode */
          <div className="p-6">
            <div className="space-y-4">
              <div>
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400">To:</span>
                <p className="text-gray-900 dark:text-white">{to || 'No recipient'}</p>
              </div>
              {cc && (
                <div>
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400">CC:</span>
                  <p className="text-gray-900 dark:text-white">{cc}</p>
                </div>
              )}
              {bcc && (
                <div>
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400">BCC:</span>
                  <p className="text-gray-900 dark:text-white">{bcc}</p>
                </div>
              )}
              <div>
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Subject:</span>
                <p className="text-gray-900 dark:text-white font-medium">{subject || 'No subject'}</p>
              </div>
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <div 
                  className="prose dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: content.replace(/\n/g, '<br>') }}
                />
              </div>
              {attachments.length > 0 && (
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                    Attachments ({attachments.length})
                  </p>
                  <div className="space-y-2">
                    {attachments.map((attachment) => (
                      <div key={attachment.id} className="flex items-center space-x-2 text-sm">
                        <Paperclip className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-900 dark:text-white">{attachment.name}</span>
                        <span className="text-gray-500">({attachment.size})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Compose Mode */
          <div className="p-6 space-y-4">
            {/* Recipients */}
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  To *
                </label>
                <input
                  type="email"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="recipient@example.com"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  multiple
                />
              </div>

              <div className="flex items-center space-x-4">
                {!showCc && (
                  <button
                    onClick={() => setShowCc(true)}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Add CC
                  </button>
                )}
                {!showBcc && (
                  <button
                    onClick={() => setShowBcc(true)}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Add BCC
                  </button>
                )}
              </div>

              {showCc && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    CC
                  </label>
                  <input
                    type="email"
                    value={cc}
                    onChange={(e) => setCc(e.target.value)}
                    placeholder="cc@example.com"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  />
                </div>
              )}

              {showBcc && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    BCC
                  </label>
                  <input
                    type="email"
                    value={bcc}
                    onChange={(e) => setBcc(e.target.value)}
                    placeholder="bcc@example.com"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  />
                </div>
              )}
            </div>

            {/* Subject */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Subject *
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Enter subject"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              />
            </div>

            {/* Toolbar */}
            <div className="border border-gray-300 dark:border-gray-600 rounded-lg">
              <div className="flex items-center space-x-1 p-2 border-b border-gray-200 dark:border-gray-700">
                <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                  <Bold className="w-4 h-4" />
                </button>
                <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                  <Italic className="w-4 h-4" />
                </button>
                <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                  <Underline className="w-4 h-4" />
                </button>
                <div className="w-px h-6 bg-gray-300 dark:bg-gray-600" />
                <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                  <Link2 className="w-4 h-4" />
                </button>
                <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                  <Image className="w-4 h-4" />
                </button>
                <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                  <Smile className="w-4 h-4" />
                </button>
              </div>

              {/* Content */}
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your email..."
                className="w-full min-h-[300px] p-3 border-0 resize-none focus:ring-0 focus:outline-none dark:bg-gray-700 dark:text-white"
              />
            </div>

            {/* Attachments */}
            {attachments.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Attachments ({attachments.length})
                </p>
                <div className="space-y-2">
                  {attachments.map((attachment) => (
                    <motion.div
                      key={attachment.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                    >
                      <div className="flex items-center space-x-3">
                        <Paperclip className="w-4 h-4 text-gray-400" />
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {attachment.name}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {attachment.size}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => removeAttachment(attachment.id)}
                        className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                      >
                        <X className="w-4 h-4 text-gray-400" />
                      </button>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Button
                onClick={handleSend}
                disabled={isSending}
                className="flex items-center space-x-2 submit-button-gradient-border"
              >
                <Send className="w-4 h-4" />
                <span>{isSending ? 'Sending...' : 'Send'}</span>
              </Button>

              <label className="cursor-pointer">
                <input
                  type="file"
                  multiple
                  onChange={handleAttachment}
                  className="hidden"
                />
                <div className="flex items-center space-x-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <Paperclip className="w-4 h-4" />
                  <span className="text-sm">Attach</span>
                </div>
              </label>
            </div>

            <div className="text-sm text-gray-500 dark:text-gray-400">
              {content.length} characters
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ComposePage;
