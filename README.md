<div align="center">

# MailVoyage - Modern Email Client for Developers and Users

[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Made with Love](https://img.shields.io/badge/Made%20with-❤️-red.svg)](https://github.com/navaranjithsai)

---
</div>

MailVoyage is a modern, developer-friendly email client designed to simplify email management and testing. It provides a unified platform for sending, receiving, and testing emails across multiple providers, all in one place. Built with React, TypeScript, and Vite, MailVoyage is optimized for performance, scalability, and ease of use. The application supports serverless deployments, making it ideal for integration with platforms like Vercel.


## Recent Commits

<div align="center">

<picture>
  <source
    srcset="https://github-commits-card.navaranjith-sai1234.workers.dev/?theme=dark&repo=MailVoyage&u=navaranjithsai&count=3"
    media="(prefers-color-scheme: dark)"
  />
  <source
    srcset="https://github-commits-card.navaranjith-sai1234.workers.dev/?u=navaranjithsai&repo=MailVoyage&theme=light"
    media="(prefers-color-scheme: light), (prefers-color-scheme: no-preference)"
  />
  <img src="https://github-commits-card.navaranjith-sai1234.workers.dev/?u=navaranjithsai&repo=MailVoyage&theme=dark" alt="GitHub Commits Card Demo" />
</picture>

<br/>
</div>
<br/>

## Features

### For Developers
- **Email Testing**: Test emails with real SMTP configurations and preview them in a user-friendly interface.
- **Multi-Provider Support**: Configure and test emails from various providers like Gmail, SMTP2Go, and others.
- **Advanced Search**: Filter emails by sender, subject, date range, attachments, and more.
- **Serverless Integration**: Deploy the backend API seamlessly on Vercel for serverless environments.

### For Users
- **Unified Inbox**: Manage emails from multiple providers in one place.
- **Email Sending**: Send emails with attachments, priority settings, and advanced formatting.
- **Folder Management**: Create, list, and organize email folders.
- **Dark Mode**: Enjoy a modern UI with light and dark theme support.

## Tech Stack
- **Frontend**: React, TypeScript, TailwindCSS, Framer Motion
- **Backend**: Node.js, Express, PostgreSQL
- **Email Services**: Nodemailer, ImapFlow
- **Validation**: Zod for schema validation
- **Deployment**: Vercel for serverless backend and frontend hosting

## Installation

### Prerequisites
- Node.js (v16 or higher)
- PostgreSQL (for local development)

### Steps
1. Clone the repository:
  ```bash
  git clone https://github.com/navaranjithsai/MailVoyage.git
  cd mailvoyage
  ```

2. Install dependencies:
  ```bash
  npm install
  npm run install:api
  ```

3. Set up environment variables:
  - Create `.env` files in `api` directory.
  - Refer to `.env.example` for required variables.

4. Start the development server:
  ```bash
  npm run dev
  ```

## Deployment
MailVoyage is optimized for serverless environments. To deploy on Vercel:
1. Link the repository to your Vercel account.
2. Configure environment variables in the Vercel dashboard.
3. Deploy the frontend and backend as separate projects or as a monorepo.

## API Endpoints
### Authentication
- `POST /auth/register`: Register a new user.
- `POST /auth/login`: Log in to the application.
- `POST /auth/forgot-password`: Request a password reset.
- More API Request like email-accounts, smtp-accounts, which embedded in mailvoyage

### Email Management
- `POST /mail/send`: Send an email.
- `GET /mail/fetch`: Fetch emails from a mailbox.
- `POST /mail/config`: Configure mail server settings.
## Development Focus

We are currently prioritizing the implementation and refinement of key features to enhance the MailVoyage experience. Our main areas of focus include:

- **Dashboard Stats**: Fixing and improving the accuracy, display, and real-time updates of email statistics on the dashboard.
- **Entire Dashboard Actions**: Refining user interactions, such as email management, folder operations, and overall dashboard responsiveness.

If you are a developer interested in contributing to these ongoing efforts or have suggestions for other features, please refer to the Contributing section below or start a discussion in the repository.

## Contributing
We welcome contributions to MailVoyage! To get started:
1. Fork the repository.
2. Create a new branch for your feature or bug fix.
3. Submit a pull request with a detailed description.

## License
MailVoyage is open-source and licensed under the MIT License.

## Contact
For questions or support, start a discussion in the Discussion tab.

---
Tech4File - Simplifying Tech for Developers and Users
