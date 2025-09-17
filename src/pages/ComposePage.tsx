import React, { useEffect, useRef, useState } from 'react';
import { motion, easeOut } from 'framer-motion';
import { Send, Paperclip, X, Save, Eye } from 'lucide-react';
import Button from '@/components/ui/Button';
import { toast } from '@/lib/toast';
import DOMPurify from 'dompurify';

// CKEditor 5
import 'ckeditor5/ckeditor5.css';
import {
  ClassicEditor,
  Essentials, Paragraph, Autoformat, PasteFromOffice,
  Bold, Italic, Underline, Strikethrough, RemoveFormat,
  FontFamily, FontSize, FontColor, FontBackgroundColor,
  Link, AutoLink,
  List, ListProperties, Indent, IndentBlock, Alignment, BlockQuote,
  Code, CodeBlock,
  // Images (with base64 upload so it works immediately)
  Image, ImageToolbar, ImageCaption, ImageStyle, ImageResize, ImageUpload, ImageInsertViaUrl, Base64UploadAdapter,
  // Tables Characters/emojis
  Table, TableToolbar, TableProperties, TableCellProperties, TableColumnResize,
  SpecialCharacters, SpecialCharactersEssentials, SpecialCharactersText, Emoji,
  Heading, Mention,
  WordCount
} from 'ckeditor5';

interface Attachment {
  id: string;
  name: string;
  size: string;
  type: string;
}

const EDITOR_MIN_HEIGHT_PX = 480;

const ComposePage: React.FC = () => {
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState(''); // HTML produced by CKEditor
  const [charCount, setCharCount] = useState(0);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [isPreview, setIsPreview] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<any>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const id = 'ck-editor-min-height';
    if (!document.getElementById(id)) {
      const style = document.createElement('style');
      style.id = id;
      style.textContent = `.ck-editor__editable[role="textbox"]{min-height:${EDITOR_MIN_HEIGHT_PX}px;}`;
      document.head.appendChild(style);
    }
  }, []);

  useEffect(() => {
    const host = editorHostRef.current;
    if (!host) return;
    let cancelled = false;
    host.innerHTML = '';

    const config = {
      licenseKey: 'GPL',
      plugins: [
        Essentials, Paragraph, Autoformat, PasteFromOffice,
        Bold, Italic, Underline, Strikethrough, RemoveFormat,
        FontFamily, FontSize, FontColor, FontBackgroundColor,
        Link, AutoLink,
        List, ListProperties, Indent, IndentBlock, Alignment, BlockQuote,
        Code, CodeBlock,
        Image, ImageToolbar, ImageCaption, ImageStyle, ImageResize, ImageUpload, ImageInsertViaUrl, Base64UploadAdapter,
        Table, TableToolbar, TableProperties, TableCellProperties, TableColumnResize,
        SpecialCharacters, SpecialCharactersEssentials, SpecialCharactersText, Emoji,
        Heading,
        Mention,
        WordCount
      ],
      toolbar: {
        items: [
          'undo', 'redo', '|',
          'heading', '|',
          'fontFamily', 'fontSize', 'fontColor', 'fontBackgroundColor', '|',
          'bold', 'italic', 'underline', 'strikethrough', '|',
          'link', 'bulletedList', 'numberedList', 'outdent', 'indent', '|',
          'alignment', 'blockQuote', 'code', 'codeBlock', '|',
          'insertTable', 'uploadImage', 'insertImageViaUrl', 'emoji', 'specialCharacters', '|',
          'removeFormat'
        ],
        shouldNotGroupWhenFull: true
      },
      placeholder: 'Write your email…',
      link: {
        addTargetToExternalLinks: true,
        defaultProtocol: 'https://'
      },
      fontFamily: { supportAllValues: true },
      fontSize: { options: [12, 14, 'default', 16, 18, 20], supportAllValues: true },
      image: {
        toolbar: [
          'toggleImageCaption', 'imageTextAlternative', '|',
          'imageStyle:alignLeft', 'imageStyle:block', 'imageStyle:alignRight', '|',
          'resizeImage'
        ]
      },
      table: {
        contentToolbar: ['tableColumn', 'tableRow', 'mergeTableCells', 'tableProperties', 'tableCellProperties']
      },
      mention: { feeds: [] },
      wordCount: {
        onUpdate: (stats: any) => !cancelled && setCharCount(stats.characters)
      }
    };

    ClassicEditor.create(host, config)
      .then((editor: any) => {
        if (cancelled) {
          editor.destroy().catch(() => {});
          return;
        }

        editorRef.current = editor;

        if (content) editor.setData(content);

        editor.model.document.on('change:data', () => {
          if (!cancelled) {
            setContent(editor.getData());
          }
        });
      })
      .catch((err: any) => {
        console.error('CKEditor init error:', err);
      });

    return () => {
      cancelled = true;
      const inst = editorRef.current;
      if (inst) {
        editorRef.current = null;
        inst.destroy().catch(() => {});
      }
      if (host) host.innerHTML = '';
    };
  }, []);

  // Use DOMPurify in the browser to sanitize preview/sent HTML.
  const sanitizeForEmail = (html: string) =>
    DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        'p','br','strong','em','u','s','a',
        'ul','ol','li','blockquote','code','pre',
        'h1','h2','h3','img','table','thead','tbody','tr','th','td','span'
      ],
      ALLOWED_ATTR: [
        'href','name','target','rel', // a
        'src','alt','width','height','style', // img
        'style' // generic styling
      ],
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|cid|data):)/i
    }) as string;

  const handleSend = async () => {
    const safeHtml = sanitizeForEmail(content);
    if (!to.trim() || !subject.trim() || !safeHtml.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSending(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      toast.success('Email sent successfully!');
      setTo(''); setCc(''); setBcc(''); setSubject(''); setContent(''); setAttachments([]); setCharCount(0);
      editorRef.current?.setData('');
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
        type: file.type
      }));
      setAttachments(prev => [...prev, ...newAttachments]);
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(att => att.id !== id));
  };

  const pageVariants = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: easeOut } }
  };

  const previewHtml = sanitizeForEmail(content);

  return (
    <motion.div className="w-full px-2.5 py-2.5" variants={pageVariants} initial="initial" animate="animate">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden w-full">
        {/* Header */}
        <div className="border-b border-gray-200 dark:border-gray-700 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Compose Email</h1>
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <Button
                variant="outline"
                onClick={() => setIsPreview(!isPreview)}
                className="flex items-center justify-center space-x-2"
              >
                <Eye className="w-4 h-4" />
                <span>{isPreview ? 'Edit' : 'Preview'}</span>
              </Button>
              <Button variant="outline" onClick={handleSaveDraft} className="flex items-center justify-center space-x-2">
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
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">To *</label>
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">CC</label>
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">BCC</label>
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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subject *</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Enter subject"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              />
            </div>

            {/* Editor (replaces custom toolbar + textarea) */}
            <div className="border border-gray-300 dark:border-gray-600 rounded-lg">
              <div className="min-h-[480px] p-2 dark:bg-gray-700 dark:text-white">
                {/* CKEditor attaches to this div. We hide it in preview mode. */}
                <div ref={editorHostRef} className={isPreview ? 'hidden' : ''} />
              </div>
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
              {charCount} characters
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ComposePage;