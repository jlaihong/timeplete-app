# Timeplete App

Cross-platform productivity application built with **Expo** (React Native + Web) and **Convex** backend.

## Features

- **Tasks**: Create, organize, and track tasks across days, lists, and sections
- **Calendar**: Day/week view with time window tracking
- **Goals / Trackables**: Multiple goal types (count, time, days/week, minutes/week, tracker)
- **Analytics**: Time breakdown by activity, tag, list, and goal with period navigation
- **Reviews**: Daily/weekly/monthly/yearly review questions and answers
- **Sharing**: Share lists and goals with collaborators
- **Timer**: One-click task and goal timers that auto-log time windows
- **Tags**: Color-coded tags for task organization
- **Recurring Tasks & Events**: Full recurrence support (daily, weekly, monthly, yearly)

## Tech Stack

- **Frontend**: Expo + React Native + Expo Router + React Native Web
- **Backend**: Convex (real-time, reactive database + serverless functions)
- **Navigation**: Expo Router with drawer + bottom tabs
- **State**: Convex reactive queries (no Redux needed)

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Convex account (https://convex.dev)

### Setup

```bash
# Install dependencies
npm install

# Create .env.local from example
cp .env.example .env.local
# Edit .env.local and add your Convex URL

# Start Convex dev server (in a separate terminal)
npx convex dev

# Start Expo dev server
npm start
```

### Running

```bash
# Web
npm run web

# iOS (requires macOS + Xcode)
npm run ios

# Android (requires Android Studio)
npm run android
```

## Project Structure

```
timeplete-app/
├── app/                    # Expo Router screens
│   ├── (auth)/            # Auth screens (login, signup, etc.)
│   └── (app)/             # Authenticated screens
│       ├── (tabs)/        # Bottom tab screens (tasks, calendar, goals, analytics, reviews)
│       ├── lists/         # List index + detail
│       ├── tags.tsx       # Tag management
│       ├── shared.tsx     # Shared items
│       └── edit-trackable/# Goal editor
├── components/            # Reusable UI components
│   ├── ui/               # Base components (Button, Card, Input, etc.)
│   ├── tasks/            # Task-specific components
│   ├── goals/            # Goal widgets and forms
│   └── ...               # Other feature components
├── convex/               # Backend (Convex functions + schema)
│   ├── schema.ts         # Database schema (~25 tables)
│   ├── _helpers/         # Auth, ordering, permissions, recurrence
│   ├── tasks.ts          # Task CRUD
│   ├── lists.ts          # List CRUD
│   ├── trackables.ts     # Goal/trackable CRUD
│   ├── analytics.ts      # Time breakdown + progression stats
│   ├── sharing.ts        # Share management
│   └── ...               # Other modules
├── hooks/                # React hooks (auth, timer, filters)
├── lib/                  # Utilities (dates, recurrence)
└── constants/            # Enums, colors, defaults
```

## Convex Schema

The backend uses ~25 tables covering:

- Users, authentication, and approval
- Tasks with nested subtasks, tags, days, sections
- Lists with sections and ordering
- Time windows (calendar events / time tracking)
- Goals/trackables with multiple types and frequencies
- Tracker entries and trackable days
- Recurring tasks and events with occurrence management
- Review questions and answers
- Sharing (lists + trackables) with permissions
- Push notification tokens

All queries are reactive and automatically update the UI in real-time.

## Auth

Configure your auth provider (Clerk, Auth0, or Convex Auth) and update:
1. `app/_layout.tsx` - Add auth provider wrapper
2. `convex/users.ts` - Token identifier mapping
3. `.env.local` - Auth environment variables
