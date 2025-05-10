// Placeholder for database models/entities
// Example using simple interfaces, could be classes or ORM models (e.g., Prisma, TypeORM)

export interface User {
  id: number;
  username: string;
  email: string;
  password_hash: string; // Keep hash internal, don't expose in API responses
  createdAt: Date;
  updatedAt: Date;
}

export interface UserPreferences {
  userId: number;
  theme: 'light' | 'dark' | 'system';
  notificationsEnabled: boolean;
  // Add other preferences
}

export interface MailServerConfig {
  userId: number;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPasswordEncrypted?: string; // Store encrypted
  smtpSecure?: boolean;
  imapHost?: string;
  imapPort?: number;
  imapUser?: string;
  imapPasswordEncrypted?: string; // Store encrypted
  imapSecure?: boolean;
  pop3Host?: string;
  pop3Port?: number;
  pop3User?: string;
  pop3PasswordEncrypted?: string; // Store encrypted
  pop3Secure?: boolean;

}
