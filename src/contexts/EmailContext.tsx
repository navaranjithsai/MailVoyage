import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { toast } from '@/lib/toast';

// Email interface matching the existing structure
export interface Email {
  id: string;
  sender: string;
  senderName?: string;
  senderEmail: string;
  recipient?: string;
  subject: string;
  preview: string;
  content?: string;
  time: string;
  isRead: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  attachments?: Array<{
    id: string;
    name: string;
    size: string;
    type: string;
  }>;
  isImportant: boolean;
  timestamp: Date;
  priority?: 'high' | 'normal' | 'low';
  folder?: string;
}

// Navigation item interface for sidebar/flowbar
export interface NavigationItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
  badge?: number;
}

interface EmailContextType {
  emails: Email[];
  unreadCount: number;
  markAsRead: (emailId: string) => void;
  markAsUnread: (emailId: string) => void;
  toggleEmailRead: (emailId: string) => void;
  deleteEmail: (emailId: string) => void;
  starEmail: (emailId: string) => void;
  unstarEmail: (emailId: string) => void;
  toggleEmailStarred: (emailId: string) => void;
  addEmail: (email: Omit<Email, 'id' | 'timestamp'>) => void;
  refreshEmails: () => Promise<void>;
  showUnreadBadge: boolean;
  setShowUnreadBadge: (show: boolean) => void;
  // Development tools
  pingNewEmail: () => void;
}

const EmailContext = createContext<EmailContextType | undefined>(undefined);

// Mock email data
const initialEmails: Email[] = [
  {
    id: '1',
    sender: 'john@example.com',
    senderName: 'John Doe',
    senderEmail: 'john@example.com',
    recipient: 'user@example.com',
    subject: 'Project Update - Q4 Results',
    preview: 'Here are the latest updates on our Q4 project. We\'ve made significant progress...',
    content: 'Hi there,\n\nHere are the latest updates on our Q4 project. We\'ve made significant progress on all fronts and I wanted to share the key highlights with you.\n\n**Key Achievements:**\n- Completed 85% of planned features\n- Reduced load times by 40%\n- Increased user engagement by 25%\n\nLet me know if you have any questions!\n\nBest regards,\nJohn',
    time: '2 hours ago',
    isRead: false,
    isStarred: true,
    hasAttachments: true,
    attachments: [
      { id: '1', name: 'Q4_Report.pdf', size: '2.4 MB', type: 'pdf' },
      { id: '2', name: 'metrics.xlsx', size: '1.2 MB', type: 'xlsx' }
    ],
    isImportant: true,
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
    priority: 'high',
    folder: 'inbox',
  },
  {
    id: '2',
    sender: 'jane@company.com',
    senderName: 'Jane Smith',
    senderEmail: 'jane@company.com',
    recipient: 'user@example.com',
    subject: 'Meeting Reminder: Team Standup',
    preview: 'Don\'t forget about our weekly team standup meeting scheduled for tomorrow at 10 AM...',
    content: 'Hi everyone,\n\nJust a friendly reminder about our weekly team standup meeting scheduled for tomorrow at 10 AM in Conference Room B.\n\n**Agenda:**\n- Sprint progress review\n- Blockers discussion\n- Next week planning\n\nSee you there!\n\nJane',
    time: '4 hours ago',
    isRead: true,
    isStarred: false,
    hasAttachments: false,
    isImportant: false,
    timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000), // 4 hours ago
    priority: 'normal',
    folder: 'inbox',
  },
  {
    id: '3',
    sender: 'marketing@company.com',
    senderName: 'Marketing Team',
    senderEmail: 'marketing@company.com',
    recipient: 'user@example.com',
    subject: 'New Campaign Launch - Action Required',
    preview: 'We\'re excited to announce the launch of our new marketing campaign. Please review...',
    content: 'Hello,\n\nWe\'re excited to announce the launch of our new marketing campaign! We need your review and approval on the final materials.\n\n**Campaign Details:**\n- Launch date: Next Monday\n- Target audience: Young professionals\n- Budget: $50,000\n\nPlease review the attached materials and let us know if you have any feedback.\n\nThanks!\nMarketing Team',
    time: '1 day ago',
    isRead: false,
    isStarred: false,
    hasAttachments: true,
    attachments: [
      { id: '3', name: 'campaign_materials.zip', size: '15.8 MB', type: 'zip' }
    ],
    isImportant: true,
    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
    priority: 'high',
    folder: 'inbox',
  },
  {
    id: '4',
    sender: 'support@company.com',
    senderName: 'Support Team',
    senderEmail: 'support@company.com',
    recipient: 'user@example.com',
    subject: 'Ticket #12345 - Resolved',
    preview: 'Your support ticket has been resolved. Thank you for your patience...',
    content: 'Dear Customer,\n\nYour support ticket #12345 has been resolved. Thank you for your patience while we worked on this issue.\n\n**Issue Summary:**\nLogin problems with two-factor authentication\n\n**Resolution:**\nWe\'ve reset your 2FA settings and sent you a new setup link.\n\nIf you continue to experience any issues, please don\'t hesitate to contact us.\n\nBest regards,\nSupport Team',
    time: '2 days ago',
    isRead: true,
    isStarred: false,
    hasAttachments: false,
    isImportant: false,
    timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
    priority: 'normal',
    folder: 'inbox',
  },
  {
    id: '5',
    sender: 'hr@company.com',
    senderName: 'HR Department',
    senderEmail: 'hr@company.com',
    recipient: 'user@example.com',
    subject: 'New Policy Updates',
    preview: 'Please review the updated company policies that will take effect next month...',
    content: 'Dear Team,\n\nPlease review the updated company policies that will take effect next month. These changes reflect our commitment to maintaining a positive work environment.\n\n**Key Changes:**\n- Updated remote work policy\n- New vacation request process\n- Enhanced diversity and inclusion guidelines\n\nPlease review the attached policy documents and acknowledge receipt by replying to this email.\n\nThank you,\nHR Department',
    time: '3 days ago',
    isRead: false,
    isStarred: true,
    hasAttachments: true,
    attachments: [
      { id: '4', name: 'company_policies_2024.pdf', size: '3.2 MB', type: 'pdf' }
    ],
    isImportant: false,
    timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
    priority: 'low',
    folder: 'inbox',
  },
];

export const EmailProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [emails, setEmails] = useState<Email[]>(initialEmails);
  const [showUnreadBadge, setShowUnreadBadge] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedPref = localStorage.getItem('mailVoyage_showUnreadBadge');
      return savedPref === null ? true : savedPref === 'true';
    }
    return true;
  });

  // Calculate unread count
  const unreadCount = emails.filter(email => !email.isRead).length;

  // Listen for changes to notification badge setting
  useEffect(() => {
    const handleStorageChange = () => {
      const savedPref = localStorage.getItem('mailVoyage_showUnreadBadge');
      setShowUnreadBadge(savedPref === null ? true : savedPref === 'true');
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const markAsRead = (emailId: string) => {
    setEmails(prev => prev.map(email => 
      email.id === emailId ? { ...email, isRead: true } : email
    ));
  };

  const markAsUnread = (emailId: string) => {
    setEmails(prev => prev.map(email => 
      email.id === emailId ? { ...email, isRead: false } : email
    ));
  };

  const toggleEmailRead = (emailId: string) => {
    setEmails(prev => prev.map(email => 
      email.id === emailId ? { ...email, isRead: !email.isRead } : email
    ));
  };

  const deleteEmail = (emailId: string) => {
    setEmails(prev => prev.filter(email => email.id !== emailId));
    toast.success('Email deleted successfully');
  };

  const starEmail = (emailId: string) => {
    setEmails(prev => prev.map(email => 
      email.id === emailId ? { ...email, isStarred: true } : email
    ));
  };

  const unstarEmail = (emailId: string) => {
    setEmails(prev => prev.map(email => 
      email.id === emailId ? { ...email, isStarred: false } : email
    ));
  };

  const toggleEmailStarred = (emailId: string) => {
    setEmails(prev => prev.map(email => 
      email.id === emailId ? { ...email, isStarred: !email.isStarred } : email
    ));
  };

  const addEmail = (emailData: Omit<Email, 'id' | 'timestamp'>) => {
    const newEmail: Email = {
      ...emailData,
      id: Date.now().toString(),
      timestamp: new Date(),
    };
    setEmails(prev => [newEmail, ...prev]);
    
    // Show toast notification for new email
    toast.info(`New email from ${newEmail.sender}: ${newEmail.subject}`, {
      position: 'top-right',
      autoClose: 5000,
    });
  };

  const refreshEmails = async () => {
    // Simulate API refresh
    await new Promise(resolve => setTimeout(resolve, 1000));
    // In a real app, this would fetch from an API
  };

  // Development tool: Generate a new email
  const pingNewEmail = () => {
    const mockSenders = [
      { name: 'Alice Johnson', email: 'alice@example.com' },
      { name: 'Bob Wilson', email: 'bob@company.com' },
      { name: 'Carol Davis', email: 'carol@startup.io' },
      { name: 'David Brown', email: 'david@tech.com' },
      { name: 'Eva Martinez', email: 'eva@design.studio' },
    ];

    const mockSubjects = [
      'Urgent: Review Required',
      'Weekly Status Update',
      'Meeting Invitation',
      'New Feature Request',
      'System Maintenance Notice',
      'Invoice #INV-2025-001',
      'Welcome to the Team!',
      'Project Milestone Reached',
      'Security Alert',
      'Newsletter - January 2025',
    ];

    const mockPreviews = [
      'This is an important message that requires your immediate attention...',
      'Please find the weekly status report attached for your review...',
      'You are invited to join our team meeting scheduled for next week...',
      'We have received a new feature request from one of our clients...',
      'Our system will undergo maintenance this weekend. Please plan accordingly...',
      'Your invoice for this month\'s services is now available...',
      'Welcome aboard! We\'re excited to have you join our team...',
      'Congratulations! We\'ve successfully reached our project milestone...',
      'We\'ve detected unusual activity on your account. Please verify...',
      'Check out our latest news and updates in this month\'s newsletter...',
    ];

    const randomSender = mockSenders[Math.floor(Math.random() * mockSenders.length)];
    const randomSubject = mockSubjects[Math.floor(Math.random() * mockSubjects.length)];
    const randomPreview = mockPreviews[Math.floor(Math.random() * mockPreviews.length)];

    const newEmail = {
      sender: randomSender.name,
      senderEmail: randomSender.email,
      subject: randomSubject,
      preview: randomPreview,
      time: 'Just now',
      isRead: false,
      isStarred: false,
      hasAttachments: Math.random() > 0.7, // 30% chance of having attachments
      isImportant: Math.random() > 0.8, // 20% chance of being important
    };

    addEmail(newEmail);
  };

  const contextValue: EmailContextType = {
    emails,
    unreadCount,
    markAsRead,
    markAsUnread,
    toggleEmailRead,
    deleteEmail,
    starEmail,
    unstarEmail,
    toggleEmailStarred,
    addEmail,
    refreshEmails,
    showUnreadBadge,
    setShowUnreadBadge,
    pingNewEmail,
  };

  return (
    <EmailContext.Provider value={contextValue}>
      {children}
    </EmailContext.Provider>
  );
};

export const useEmail = (): EmailContextType => {
  const context = useContext(EmailContext);
  if (context === undefined) {
    throw new Error('useEmail must be used within an EmailProvider');
  }
  return context;
};
