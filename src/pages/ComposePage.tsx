import React, { useEffect, useRef, useState } from 'react';
import { motion, easeOut } from 'framer-motion';
import { Send, Paperclip, X, Save, Eye, ChevronDown, FileEdit, Check } from 'lucide-react';
import Button from '@/components/ui/Button';
import { toast } from '@/lib/toast';
import DOMPurify from 'dompurify';
import { apiFetch } from '@/lib/apiFetch';
import { useNavigate, useLocation } from 'react-router-dom';
import { injectEmailStyles, formatFileSize } from '@/lib/emailStyles';
import {
  saveDraft,
  deleteDraft,
  type EmailDraft,
  type DraftAttachment,
} from '@/lib/mailCache';

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
  size: number; // Size in bytes for accurate calculation
  sizeFormatted: string; // Human-readable size
  type: string;
  content: string; // Base64 encoded file content
}

interface EmailAccount {
  id: string;
  email: string;
  accountCode: string;
  isPrimary?: boolean;
  type: 'email' | 'smtp';
}

const ComposePage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [fromAccount, setFromAccount] = useState<EmailAccount | null>(null);
  const [availableAccounts, setAvailableAccounts] = useState<EmailAccount[]>([]);
  const [showFromDropdown, setShowFromDropdown] = useState(false);
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
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  
  // Draft state
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [isDraftLoaded, setIsDraftLoaded] = useState(false);

  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<any>(null);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedContentRef = useRef<string>('');

  // Inject shared email styles
  useEffect(() => {
    injectEmailStyles();
  }, []);

  // Load email accounts from localStorage
  useEffect(() => {
    try {
      const emailAccountsStr = localStorage.getItem('emailAccounts');
      const smtpAccountsStr = localStorage.getItem('smtpAccounts');
      
      const accounts: EmailAccount[] = [];
      
      // Load email accounts
      if (emailAccountsStr) {
        const emailAccounts = JSON.parse(emailAccountsStr);
        emailAccounts.forEach((acc: any) => {
          accounts.push({
            id: acc.id,
            email: acc.email,
            accountCode: acc.accountCode,
            isPrimary: acc.isPrimary,
            type: 'email',
          });
        });
      }
      
      // Load SMTP-only accounts
      if (smtpAccountsStr) {
        const smtpAccounts = JSON.parse(smtpAccountsStr);
        smtpAccounts.forEach((acc: any) => {
          accounts.push({
            id: acc.id,
            email: acc.email,
            accountCode: acc.accountCode,
            type: 'smtp',
          });
        });
      }
      
      setAvailableAccounts(accounts);
      
      // Set primary account as default, or first account
      const primaryAccount = accounts.find(acc => acc.isPrimary);
      setFromAccount(primaryAccount || accounts[0] || null);
      
    } catch (error) {
      console.error('Error loading email accounts:', error);
    }
  }, []);

  // Load draft data if navigating from drafts page
  useEffect(() => {
    const state = location.state as { 
      draftId?: string; 
      fromDraft?: boolean; 
      draftData?: EmailDraft;
      type?: string;
      originalEmail?: any;
    } | null;
    
    if (state?.fromDraft && state?.draftData) {
      const draft = state.draftData;
      setCurrentDraftId(draft.id);
      setTo(draft.to || '');
      setCc(draft.cc || '');
      setBcc(draft.bcc || '');
      setSubject(draft.subject || '');
      setContent(draft.htmlContent || '');
      setCharCount(draft.charCount || 0);
      
      // Set CC/BCC visibility based on content
      if (draft.cc) setShowCc(true);
      if (draft.bcc) setShowBcc(true);
      
      // Convert draft attachments to component format
      if (draft.attachments && draft.attachments.length > 0) {
        const convertedAttachments: Attachment[] = draft.attachments.map(att => ({
          id: att.id,
          name: att.name,
          size: att.size,
          sizeFormatted: att.sizeFormatted,
          type: att.type,
          content: att.content,
        }));
        setAttachments(convertedAttachments);
      }
      
      // Set from account if it exists
      if (draft.fromAccountId && availableAccounts.length > 0) {
        const account = availableAccounts.find(acc => acc.id === draft.fromAccountId);
        if (account) {
          setFromAccount(account);
        }
      }
      
      setIsDraftLoaded(true);
      lastSavedContentRef.current = draft.htmlContent || '';
      
      // Clear location state to prevent re-loading on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location.state, availableAccounts]);

  // Track unsaved changes
  useEffect(() => {
    const currentState = JSON.stringify({ to, cc, bcc, subject, content, attachments });
    const savedState = lastSavedContentRef.current;
    
    if (currentDraftId && savedState && currentState !== savedState) {
      setDraftSaved(false);
    }
  }, [to, cc, bcc, subject, content, attachments, currentDraftId]);

  // Cleanup auto-save timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  // Sync editor content when draft is loaded
  useEffect(() => {
    if (isDraftLoaded && editorRef.current && content) {
      editorRef.current.setData(content);
      setIsDraftLoaded(false); // Reset flag after syncing
    }
  }, [isDraftLoaded, content]);

  useEffect(() => {
    const host = editorHostRef.current;
    if (!host) return;
    let cancelled = false;
    host.innerHTML = '';

    const config: any = {
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
      heading: {
        options: [
          { model: 'paragraph', title: 'Paragraph', class: 'ck-heading_paragraph' },
          { model: 'heading1', view: 'h1', title: 'Heading 1', class: 'ck-heading_heading1' },
          { model: 'heading2', view: 'h2', title: 'Heading 2', class: 'ck-heading_heading2' },
          { model: 'heading3', view: 'h3', title: 'Heading 3', class: 'ck-heading_heading3' }
        ]
      },
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

        // Set initial content if available (including from draft)
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
        'p','br','strong','b','em','i','u','s','a',
        'ul','ol','li','blockquote','code','pre',
        'h1','h2','h3','h4','img','figure','figcaption',
        'table','thead','tbody','tr','th','td','span','div'
      ],
      ALLOWED_ATTR: [
        'href','name','target','rel', // a
        'src','alt','width','height','style', // img
        'style','class', // generic styling
        'colspan','rowspan','scope', // table
      ],
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|cid|data):)/i
    }) as string;

  const handleSend = async () => {
    // Validation
    if (!fromAccount) {
      toast.error('Please select a sender account');
      return;
    }
    
    if (!to.trim()) {
      toast.error('Please enter recipient email address');
      return;
    }
    
    if (!subject.trim()) {
      toast.error('Please enter email subject');
      return;
    }
    
    const safeHtml = sanitizeForEmail(content);
    if (!safeHtml.trim()) {
      toast.error('Please enter email content');
      return;
    }

    setIsSending(true);
    try {
      // Parse recipients
      const toArray = to.split(',').map(e => e.trim()).filter(e => e);
      const ccArray = cc ? cc.split(',').map(e => e.trim()).filter(e => e) : [];
      const bccArray = bcc ? bcc.split(',').map(e => e.trim()).filter(e => e) : [];
      
      // Prepare payload
      const payload = {
        accountCode: fromAccount.accountCode,
        to: toArray,
        cc: ccArray.length > 0 ? ccArray : undefined,
        bcc: bccArray.length > 0 ? bccArray : undefined,
        subject: subject,
        html: safeHtml,
        text: content.replace(/<[^>]*>/g, ''), // Strip HTML for plain text version
        attachments: attachments.length > 0 ? attachments.map(att => ({
          filename: att.name,
          content: att.content, // Base64 encoded content
          contentType: att.type,
          size: att.size,
        })) : undefined,
      };
      
      // Send email via API
      const response = await apiFetch('/api/mail/send', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      
      toast.success(response.message || 'Email sent successfully!');
      
      // Delete the draft if it exists (email was sent successfully)
      if (currentDraftId) {
        try {
          await deleteDraft(currentDraftId);
          setCurrentDraftId(null);
        } catch (draftError) {
          console.error('Error deleting draft after send:', draftError);
          // Don't show error to user - email was sent successfully
        }
      }
      
      // Clear form
      setTo(''); 
      setCc(''); 
      setBcc(''); 
      setSubject(''); 
      setContent(''); 
      setAttachments([]); 
      setCharCount(0);
      editorRef.current?.setData('');
      
      // Navigate to sent folder
      setTimeout(() => {
        navigate('/sent');
      }, 1500);
      
    } catch (error: any) {
      console.error('Error sending email:', error);
      toast.error(error.message || 'Failed to send email');
    } finally {
      setIsSending(false);
    }
  };

  const handleSaveDraft = async () => {
    setIsSavingDraft(true);
    
    try {
      // Convert attachments to draft format
      const draftAttachments: DraftAttachment[] = attachments.map(att => ({
        id: att.id,
        name: att.name,
        size: att.size,
        sizeFormatted: att.sizeFormatted,
        type: att.type,
        content: att.content,
      }));
      
      const draftData = {
        id: currentDraftId || undefined,
        createdAt: currentDraftId ? undefined : undefined, // Will be set by saveDraft if new
        fromAccountId: fromAccount?.id || null,
        fromEmail: fromAccount?.email || null,
        to,
        cc,
        bcc,
        subject,
        htmlContent: content,
        textContent: content.replace(/<[^>]*>/g, ''), // Strip HTML
        attachments: draftAttachments,
        charCount,
      };
      
      const savedDraft = await saveDraft(draftData);
      setCurrentDraftId(savedDraft.id);
      lastSavedContentRef.current = JSON.stringify({ to, cc, bcc, subject, content, attachments });
      setDraftSaved(true);
      
      toast.success('Draft saved');
      
      // Reset the saved indicator after 3 seconds
      setTimeout(() => {
        setDraftSaved(false);
      }, 3000);
      
    } catch (error: any) {
      console.error('Error saving draft:', error);
      toast.error('Failed to save draft');
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleAttachment = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const newAttachments: Attachment[] = [];
      
      for (const file of Array.from(files)) {
        try {
          // Read file as base64
          const base64Content = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result as string;
              // Remove data URL prefix (e.g., "data:image/png;base64,")
              const base64 = result.split(',')[1] || result;
              resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          
          newAttachments.push({
            id: Math.random().toString(36).substr(2, 9),
            name: file.name,
            size: file.size,
            sizeFormatted: formatFileSize(file.size),
            type: file.type || 'application/octet-stream',
            content: base64Content,
          });
        } catch (error) {
          console.error(`Failed to read file ${file.name}:`, error);
          toast.error(`Failed to read file: ${file.name}`);
        }
      }
      
      setAttachments(prev => [...prev, ...newAttachments]);
    }
    // Reset input value to allow re-selecting the same file
    event.target.value = '';
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
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {currentDraftId ? 'Edit Draft' : 'Compose Email'}
              </h1>
              {currentDraftId && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                  <FileEdit className="w-3 h-3 mr-1" />
                  Draft
                </span>
              )}
              {draftSaved && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                >
                  <Check className="w-3 h-3 mr-1" />
                  Saved
                </motion.span>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <Button
                variant="outline"
                onClick={() => setIsPreview(!isPreview)}
                className="flex items-center justify-center space-x-2"
              >
                <Eye className="w-4 h-4" />
                <span>{isPreview ? 'Edit' : 'Preview'}</span>
              </Button>
              <Button 
                variant="outline" 
                onClick={handleSaveDraft} 
                disabled={isSavingDraft}
                className="flex items-center justify-center space-x-2"
              >
                {isSavingDraft ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    >
                      <Save className="w-4 h-4" />
                    </motion.div>
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save Draft</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {isPreview && (
          /* Preview Mode */
          <div className="p-6">
            <div className="space-y-4">
              <div>
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400">From:</span>
                <div className="flex items-center space-x-2 mt-1">
                  <p className="text-gray-900 dark:text-white">{fromAccount?.email || 'No sender selected'}</p>
                  {fromAccount?.type === 'smtp' && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                      SMTP Only
                    </span>
                  )}
                </div>
              </div>
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
                  className="ck-content email-preview max-w-none text-gray-900 dark:text-gray-100"
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
                        <span className="text-gray-500">({attachment.sizeFormatted})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Compose Mode */}
        <div className={`p-6 space-y-4 ${isPreview ? 'hidden' : ''}`}>
            {/* From Account Selector */}
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">From *</label>
              {availableAccounts.length === 0 ? (
                <div className="w-full px-3 py-2 border border-yellow-300 dark:border-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    No email accounts available. Please{' '}
                    <button
                      onClick={() => navigate('/settings')}
                      className="font-medium underline hover:no-underline"
                    >
                      add an email account
                    </button>
                    {' '}first.
                  </p>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => setShowFromDropdown(!showFromDropdown)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white flex items-center justify-between"
                  >
                    <div className="flex items-center space-x-2">
                      <span>{fromAccount?.email || 'Select account'}</span>
                      {fromAccount?.type === 'smtp' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                          SMTP Only
                        </span>
                      )}
                      {fromAccount?.isPrimary && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                          Primary
                        </span>
                      )}
                    </div>
                    <ChevronDown className={`w-4 h-4 transition-transform ${showFromDropdown ? 'rotate-180' : ''}`} />
                  </button>
                  
                  {showFromDropdown && (
                    <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {availableAccounts.map((account) => (
                        <button
                          key={account.id}
                          onClick={() => {
                            setFromAccount(account);
                            setShowFromDropdown(false);
                          }}
                          className={`w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center justify-between ${
                            fromAccount?.id === account.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <span className="text-gray-900 dark:text-white">{account.email}</span>
                            {account.type === 'smtp' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                                SMTP Only
                              </span>
                            )}
                            {account.isPrimary && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                                Primary
                              </span>
                            )}
                          </div>
                          {account.accountCode && (
                            <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                              {account.accountCode}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

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
                            {attachment.sizeFormatted}
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