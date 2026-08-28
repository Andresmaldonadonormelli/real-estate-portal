# Quickstart - 3 Minutes to Running

## Prerequisites
- Node.js installed (download from https://nodejs.org - LTS version)
- Terminal/Command Prompt
- Web browser

## Steps

### 1. Open Terminal/Command Prompt

Navigate to the project folder. For example:
```
cd ~/Downloads/real-estate-portal
```

Or if you extracted it elsewhere, replace with your path.

### 2. Install Dependencies

Copy and paste this:
```
npm install
```

Wait for it to finish (2-3 minutes). You'll see "added X packages".

### 3. Start the Dev Server

Copy and paste this:
```
npm run dev
```

You'll see:
```
  ➜  Local:        http://localhost:3000
```

### 4. Open in Browser

Click this link: http://localhost:3000

Or copy-paste it into your browser's address bar.

## That's It!

The app is now running. You can:
- Navigate between Dashboard, Properties, and Ledger
- Click "August 2026" in the Ledger to expand transactions
- Filter transactions by type, category, or search
- Toggle Light/Dark mode (click sun/moon icon)
- Resize your browser to see mobile and desktop layouts

## To Stop the Server

Press `Ctrl+C` in the terminal.

## Troubleshooting

**"npm: command not found"**
→ Node.js isn't installed. Download from https://nodejs.org and try again.

**Port 3000 already in use**
→ Stop any other apps using port 3000, or run:
```
npm run dev -- -p 3001
```

**Build/Install errors**
→ Delete node_modules and try again:
```
rm -rf node_modules package-lock.json
npm install
```

---

That's all you need to get started. The app uses mock data so everything works immediately.
