# Announcements System (Banner + Reminders)

This document explains how the **Announcements** feature works, what each button does, and how to run your two primary workflows:

- **Public Banner Announcements** (shown to non-users on the landing page)
- **In-app Announcements** (shown to logged-in users, optionally targeted by plan)

## Where announcements appear

Announcements can show up in multiple surfaces depending on configuration:

- **Landing page (not logged in)**: shows a **Public banner** if the announcement is **Active + Banner + Public** and within the time window.
- **In-app top banner (logged in)**: shows a banner if **Active + Banner** (Public not required) and the user matches targeting + time window.
- **Reminders dropdown (bell)**: shows announcement reminders (in offline/studio mode, this dropdown is called **Reminders**).

## Admin Dashboard → Announcements tab

### Announcements list

- **Create**
  - Opens the editor modal for a new announcement.

- **Activate / Deactivate**
  - **Activate**: sets `isActive=true`. Announcement becomes eligible to show.
  - **Deactivate**: sets `isActive=false`. Announcement stops showing everywhere.

- **Make Banner / Unbanner**
  - **Make Banner**: sets `isBanner=true`. Announcement can show as a top banner.
  - **Unbanner**: sets `isBanner=false`. Announcement won’t show as a top banner, but can still appear in the Reminders dropdown for logged-in users.

- **Edit**
  - Opens editor for the selected announcement.

- **Delete**
  - Permanently deletes the announcement. It will stop showing immediately.

### Editor modal (Create/Edit)

- **Title**
  - Shown in the banner header.
  - Also used in the Reminders dropdown as `📣 {Title}`.

- **Body**
  - Main banner message.

- **Type (Info / Success / Warning)**
  - Controls banner styling:
    - **Info** → blue
    - **Success** → green
    - **Warning** → yellow

- **Active**
  - When ON: eligible to show (depending on other filters).
  - When OFF: hidden everywhere.

- **Banner**
  - When ON: eligible to show as a top banner.
  - When OFF: won’t show as a banner (but can still appear in Reminders for logged-in users).

- **Public**
  - When ON: eligible to show on the **landing page** (not logged in).
  - When OFF: only logged-in users can see it (subject to targeting).

- **Target Plans (optional)**
  - Empty: show to all logged-in users (all plans).
  - Selected: only users whose `user.plan` matches will see it in-app.
  - **Note**: Target Plans does not apply to the landing page (non-users have no plan yet).

- **Starts At / Ends At (optional)**
  - These schedule when the announcement should show.
  - Uses a **calendar + time picker** (`datetime-local`).
  - Stored internally as **UTC ISO** (e.g., `2026-01-01T05:00:00.000Z`).
  - Recommended: set your machine timezone to **Eastern Time** to match your workflow.

- **Action Label (optional)**
  - If set, the in-app banner will show a button with this label.
  - If empty, no action button is shown.

- **Action Page**
  - The in-app destination when the banner’s button is clicked.
  - Examples:
    - **Pricing**: take the user to upgrade screen
    - **Settings**: take the user to account settings/billing settings
    - **OnlyFans Studio**: take Elite users directly to the studio

## User behavior (what users can do)

- **Dismiss banner (X)**
  - Dismiss is stored in localStorage:
    - Logged-in: per-user key `dismissedAnnouncements:{userId}`
    - Landing page: `dismissedPublicAnnouncements`
  - Dismiss hides the banner for that user/browser.
  - Dismiss does not delete the announcement and does not affect other users.

## Recommended workflows

### Workflow A: Public banner announcement (your “main workflow”)

Use for: site-wide message for non-users and users.

1. Create announcement
2. Set:
   - Active: ON
   - Banner: ON
   - Public: ON
3. Optional:
   - Set Starts/Ends window
   - Add Action Label + Action Page for logged-in users

### Workflow B: In-app upgrade announcement

Use for: “Free users, upgrade to Pro/Elite and get a reward.”

1. Create announcement
2. Set:
   - Active: ON
   - Banner: ON (or OFF if you want Reminders-only)
   - Public: OFF
   - Target Plans: Free
3. Optional:
   - Action Label: “Upgrade”
   - Action Page: Pricing

Then grant the reward to the cohort using **Promo Cohort Grants** (see `REWARDS_SYSTEM.md`).


