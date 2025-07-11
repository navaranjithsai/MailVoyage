// Mock email data for development - TO BE REMOVED IN PRODUCTION
// This file contains all mock email data for testing and development purposes
// All real email data should come from the API in production

import { Email } from '@/contexts/EmailContext';

// Mock sender data
const mockSenders = [
  { name: 'GitHub', email: 'notifications@github.com' },
  { name: 'Mailchimp', email: 'team@mailchimp.com' },
  { name: 'Stripe', email: 'support@stripe.com' },
  { name: 'TechCrunch', email: 'newsletter@techcrunch.com' },
  { name: 'AWS', email: 'alerts@aws.amazon.com' },
  { name: 'Alice Johnson', email: 'alice@example.com' },
  { name: 'Bob Wilson', email: 'bob@company.com' },
  { name: 'Carol Davis', email: 'carol@startup.io' },
  { name: 'David Brown', email: 'david@tech.com' },
  { name: 'Eva Martinez', email: 'eva@design.studio' },
  { name: 'Microsoft Teams', email: 'noreply@teams.microsoft.com' },
  { name: 'LinkedIn', email: 'invitations@linkedin.com' },
  { name: 'Slack', email: 'notifications@slack.com' },
  { name: 'Vercel', email: 'notifications@vercel.com' },
  { name: 'Docker Hub', email: 'noreply@docker.com' },
];

// Mock subjects and previews
const mockEmailTemplates = [
  {
    subject: 'New pull request on MailVoyage',
    preview: 'A new pull request has been opened for review on your repository...',
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
- Search history and saved searches
- Performance optimizations for large email datasets

Please review the changes and provide feedback. The CI checks are passing and all tests are green.

Best regards,
GitHub Team`,
    hasAttachments: false,
    priority: 'high' as const,
  },
  {
    subject: 'Your monthly email campaign report',
    preview: 'Here\'s how your recent email campaigns performed...',
    content: `Hello!

Your monthly email campaign performance report is now available.

**Campaign Summary:**
- Total emails sent: 15,234
- Open rate: 24.5% (↑ 3.2% from last month)
- Click-through rate: 4.8% (↑ 1.1% from last month)
- Unsubscribe rate: 0.3%

**Top Performing Campaigns:**
1. Newsletter #47 - Open rate: 31.2%
2. Product Update - Open rate: 28.9%
3. Holiday Special - Open rate: 26.7%

View your detailed analytics dashboard for more insights.

Happy email marketing!
Mailchimp Team`,
    hasAttachments: true,
    priority: 'normal' as const,
  },
  {
    subject: 'Payment confirmed',
    preview: 'Your payment of $29.99 has been successfully processed...',
    content: `Payment Confirmation

Thank you for your payment! Here are the details:

**Transaction Details:**
- Amount: $29.99 USD
- Transaction ID: txn_1A2B3C4D5E6F
- Payment method: •••• •••• •••• 4242
- Status: Completed
- Date: ${new Date().toLocaleDateString()}

**Billing Information:**
- Product: MailVoyage Pro Plan
- Billing period: Monthly
- Next billing date: ${new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString()}

If you have any questions, please contact our support team.

Best regards,
Stripe Team`,
    hasAttachments: false,
    priority: 'normal' as const,
  },
  {
    subject: 'Weekly tech roundup',
    preview: 'The latest news and trends in technology this week...',
    content: `This Week in Tech

Here are the most important technology stories from this week:

**AI & Machine Learning:**
- OpenAI announces GPT-5 with improved reasoning capabilities
- Google releases new AI-powered search features
- Meta's latest AI model shows 40% improvement in efficiency

**Web Development:**
- React 19 enters beta with new concurrent features
- Next.js 15 introduces improved performance optimizations
- Tailwind CSS 4.0 alpha released with new design system

**Cloud & DevOps:**
- AWS announces new serverless container service
- Microsoft Azure expands edge computing capabilities
- Docker Desktop gets native Kubernetes support

**Cybersecurity:**
- New vulnerability discovered in popular npm packages
- Apple introduces enhanced privacy features in Safari
- Enterprise security spending increases by 25% YoY

Stay ahead of the curve with TechCrunch!

Best,
TechCrunch Editorial Team`,
    hasAttachments: false,
    priority: 'low' as const,
  },
  {
    subject: 'EC2 instance alert',
    preview: 'High CPU usage detected on your EC2 instance...',
    content: `AWS CloudWatch Alert

**Alert Details:**
- Instance ID: i-1234567890abcdef0
- Instance Type: t3.medium
- Region: us-east-1
- Availability Zone: us-east-1a

**Alert Condition:**
CPU Utilization has exceeded 80% for 10 consecutive minutes.

**Current Metrics:**
- CPU Utilization: 87.3%
- Memory Usage: 73.2%
- Network In: 15.6 MB/s
- Network Out: 8.9 MB/s

**Recommended Actions:**
1. Scale up the instance type if this is expected load
2. Check for any runaway processes
3. Review application performance logs
4. Consider enabling auto-scaling

**Quick Actions:**
- View CloudWatch Dashboard
- SSH into instance
- Create AMI backup
- Configure auto-scaling

This alert was generated at ${new Date().toISOString()}.

AWS CloudWatch Team`,
    hasAttachments: true,
    priority: 'high' as const,
  },
  {
    subject: 'Team meeting agenda - January 2025',
    preview: 'Please review the agenda for our upcoming team meeting...',
    content: `Team Meeting Agenda

**Date:** ${new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString()}
**Time:** 10:00 AM - 11:30 AM
**Location:** Conference Room A / Zoom (Hybrid)

**Agenda Items:**

1. **Project Updates (30 min)**
   - MailVoyage v2.0 progress
   - API integration status
   - Frontend optimization results

2. **Q1 Planning (30 min)**
   - OKRs review and setting
   - Resource allocation
   - Sprint planning for next quarter

3. **Technical Discussion (20 min)**
   - Architecture decisions for scaling
   - Security audit findings
   - Performance monitoring setup

4. **Team Updates (10 min)**
   - New team member introductions
   - Training and development plans
   - Upcoming conferences and events

Please come prepared with your updates and any questions.

Best regards,
Team Lead`,
    hasAttachments: true,
    priority: 'normal' as const,
  },
];

// Utility function to create a single mock email
export const createMockEmail = (id: string, overrides: Partial<Email> = {}): Email => {
  const randomSender = mockSenders[Math.floor(Math.random() * mockSenders.length)];
  const randomTemplate = mockEmailTemplates[Math.floor(Math.random() * mockEmailTemplates.length)];
  
  const baseEmail: Email = {
    id,
    sender: randomSender.name,
    senderName: randomSender.name,
    senderEmail: randomSender.email,
    recipient: 'user@example.com',
    subject: randomTemplate.subject,
    preview: randomTemplate.preview,
    content: randomTemplate.content,
    time: getRandomTimeAgo(),
    isRead: Math.random() > 0.6, // 40% chance of being unread
    isStarred: Math.random() > 0.8, // 20% chance of being starred
    hasAttachments: randomTemplate.hasAttachments,
    attachments: randomTemplate.hasAttachments ? generateMockAttachments() : [],
    isImportant: Math.random() > 0.85, // 15% chance of being important
    timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000), // Random time within last week
    priority: randomTemplate.priority,
    folder: 'inbox',
  };

  return { ...baseEmail, ...overrides };
};

// Generate mock attachments
const generateMockAttachments = () => {
  const attachmentTypes = [
    { name: 'report.pdf', size: '2.3 MB', type: 'application/pdf' },
    { name: 'presentation.pptx', size: '5.7 MB', type: 'application/vnd.ms-powerpoint' },
    { name: 'data.xlsx', size: '1.2 MB', type: 'application/vnd.ms-excel' },
    { name: 'image.png', size: '486 KB', type: 'image/png' },
    { name: 'document.docx', size: '892 KB', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  ];

  const numAttachments = Math.floor(Math.random() * 3) + 1; // 1-3 attachments
  const selectedAttachments = [];
  
  for (let i = 0; i < numAttachments; i++) {
    const attachment = attachmentTypes[Math.floor(Math.random() * attachmentTypes.length)];
    selectedAttachments.push({
      id: `att_${Date.now()}_${i}`,
      ...attachment,
    });
  }
  
  return selectedAttachments;
};

// Generate random "time ago" strings
const getRandomTimeAgo = (): string => {
  const timeOptions = [
    'Just now', '2 minutes ago', '15 minutes ago', '1 hour ago', '2 hours ago',
    '4 hours ago', '6 hours ago', '1 day ago', '2 days ago', '3 days ago',
    '1 week ago', '2 weeks ago'
  ];
  return timeOptions[Math.floor(Math.random() * timeOptions.length)];
};

// Enhanced mock emails with more realistic data
export const generateEnhancedMockEmails = (): Email[] => {
  const emails: Email[] = [];
  
  // Generate specific emails with known content
  mockEmailTemplates.forEach((template, index) => {
    const sender = mockSenders[index % mockSenders.length];
    emails.push(createMockEmail(`${index + 1}`, {
      sender: sender.name,
      senderName: sender.name,
      senderEmail: sender.email,
      subject: template.subject,
      preview: template.preview,
      content: template.content,
      hasAttachments: template.hasAttachments,
      attachments: template.hasAttachments ? generateMockAttachments() : [],
      priority: template.priority,
      isRead: index > 2, // First 3 emails are unread
      isStarred: index === 0 || index === 3, // First and fourth emails are starred
      timestamp: new Date(Date.now() - (index + 1) * 60 * 60 * 1000), // Hourly intervals
      time: `${index + 1} hour${index + 1 > 1 ? 's' : ''} ago`,
    }));
  });

  // Add some additional random emails
  for (let i = mockEmailTemplates.length; i < 15; i++) {
    emails.push(createMockEmail(`${i + 1}`));
  }

  return emails.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
};

// Generate a single random email for the "ping" functionality  
export const generateRandomMockEmail = (): Omit<Email, 'id' | 'timestamp'> => {
  const randomSender = mockSenders[Math.floor(Math.random() * mockSenders.length)];
  const randomTemplate = mockEmailTemplates[Math.floor(Math.random() * mockEmailTemplates.length)];
  
  return {
    sender: randomSender.name,
    senderName: randomSender.name,
    senderEmail: randomSender.email,
    recipient: 'user@example.com',
    subject: randomTemplate.subject,
    preview: randomTemplate.preview,
    content: randomTemplate.content,
    time: 'Just now',
    isRead: false, // New emails are always unread
    isStarred: false,
    hasAttachments: randomTemplate.hasAttachments,
    attachments: randomTemplate.hasAttachments ? generateMockAttachments() : [],
    isImportant: Math.random() > 0.85,
    priority: randomTemplate.priority,
    folder: 'inbox',
  };
};

// Quick access to specific email templates (for development tools)
export const getPingEmailTemplates = () => {
  return mockEmailTemplates.map((template, index) => ({
    id: `template_${index}`,
    name: template.subject,
    template,
  }));
};
