# Real Estate Owner Portal - Phase 1

A complete, working Next.js web app for managing rental properties.

## What Works Right Now

✅ **Dashboard** - Portfolio overview with stats, properties, units, recent activity
✅ **Properties** - Property list with unit details
✅ **Ledger** - Monthly groups, table view, filters, export to CSV
✅ **Navigation** - Mobile bottom nav, desktop side drawer
✅ **Theming** - Light/Dark/System with persistence
✅ **Mock Data** - Realistic Cleveland property data

## Quick Start

### 1. Install Node.js
If you don't have Node.js installed, download it from https://nodejs.org (LTS version recommended).

### 2. Navigate to the project folder
```bash
cd real-estate-portal
```

### 3. Install dependencies
```bash
npm install
```

This will install Next.js, React, and other required packages.

### 4. Start the development server
```bash
npm run dev
```

The app will start at http://localhost:3000

### 5. Open in your browser
Visit http://localhost:3000 in your web browser.

## What to Try

1. **Dashboard** - See portfolio stats, properties, units
2. **Properties** - View property details and unit info
3. **Ledger**
   - Click "August 2026" to expand/collapse
   - Toggle between "Months" and "Table" view
   - Use filters: Type (Income/Expense), Category, Amount range
   - Try searching for "Unit #1" or "Maintenance"
   - Click "Export" to download CSV
4. **Theme** - Click the sun/moon/gear icon in the sidebar to toggle themes
5. **Navigation** - Click items in the sidebar (desktop) or bottom nav (mobile)

## File Structure

```
app/                      - Next.js pages
├── page.tsx             - Dashboard
├── properties/page.tsx  - Properties
├── ledger/page.tsx      - Ledger (main feature)
├── work-orders/page.tsx - Placeholder
├── account/page.tsx     - Placeholder
└── layout.tsx           - Root layout

components/
├── layout/              - Navigation & layout
│   ├── MainLayout.tsx
│   ├── BottomNav.tsx
│   ├── SideNav.tsx
│   └── ThemeToggle.tsx
└── common/              - Reusable components
    └── StatCard.tsx

lib/
├── types.ts            - TypeScript interfaces
├── mockData.ts         - Sample data (Cleveland property)
├── formatters.ts       - Currency, date formatting
└── calculations.ts     - Portfolio math

app/globals.css         - Theme variables & base styles
```

## Development Commands

```bash
npm run dev    # Start development server
npm run build  # Build for production
npm start      # Start production server
```

## Responsive Design

- Works on mobile (380px+), tablet, and desktop
- Bottom navigation on mobile
- Side drawer on desktop (768px+)
- All tables scroll horizontally on narrow screens

## Dark Mode

The app automatically respects your system's dark mode preference. You can also:
- Click the theme toggle in the sidebar
- Select Light, Dark, or System
- Preference is saved to localStorage

## Next Steps

Once you're ready to add more features:
1. **Connect Supabase** for real data persistence
2. **Add authentication** for multi-user support
3. **Create Work Orders section** (same pattern as Ledger)
4. **Add document management**
5. **Build transaction form** for adding new entries

## Troubleshooting

**"npm: command not found"**
- Node.js is not installed. Download from https://nodejs.org

**"Port 3000 is already in use"**
- Something else is running on that port. Either:
  - Kill the process: `lsof -ti:3000 | xargs kill -9`
  - Use a different port: `npm run dev -- -p 3001`

**Styles not loading correctly**
- Clear .next folder: `rm -rf .next`
- Restart the server: Stop (Ctrl+C) and `npm run dev`

**Dark mode not working**
- Make sure JavaScript is enabled
- Try clearing browser cache
- Check that localStorage is enabled

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Performance Notes

- All data is in-memory (no database yet)
- Filtering happens client-side
- CSS uses variables for instant theme switching
- No heavy dependencies - just Next.js and React

## What's NOT Included

❌ Authentication (add in Phase 2)
❌ Database (use mock data for now)
❌ Work Orders (placeholder ready)
❌ Documents (placeholder ready)
❌ Transaction form (ready to build)
❌ Mobile app (web-only for Phase 1)

---

**Ready to go!** Questions? Check the code comments or review the specific pages.
