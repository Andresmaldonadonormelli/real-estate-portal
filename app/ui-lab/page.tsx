'use client';

import { useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { PageAction, ProductSelect, SecondaryButton, SegmentedControl, UnderlineTabs } from '@/components/common/ProductControls';
import PropertyPicker from '@/components/common/PropertyPicker';
import NotificationBell from '@/components/dashboard/NotificationBell';
import { Button } from '@/components/ui/Button';
import { propertyChipName } from '@/lib/formatters';
import { LAB_PROPERTIES } from './fixtures';

function noop() {}

const reviewButton = {
  padding: '10px 14px',
  border: 0,
  borderRadius: 'var(--radius-pill)',
  background: 'var(--accent)',
  color: 'var(--accent-contrast)',
  cursor: 'pointer',
} as const;

export default function UiLabPage() {
  return (
    <div className="ui-lab">
      <header className="ui-lab-header">
        <p className="ui-lab-kicker">AM Properties</p>
        <h1>UI Lab</h1>
        <p>Buttons, property pickers, segmented controls, status badges, and the notification popover. Each theme panel uses the same components the portal imports. Hover, press, and tab a control to see its live states.</p>
      </header>

      <section className="ui-lab-section">
        <h2>Buttons</h2>
        <p>Filled actions split between the shared Button and several accent classes. Disabled is shown where the stylesheet defines it.</p>
        <Themes View={ButtonBoard} />
      </section>

      <section className="ui-lab-section">
        <h2>Property picker</h2>
        <p>Ledger uses one picker with a select on wide screens and a sheet below 768px. Overview uses a select on wide screens and scrolling chips on a phone. Utilities uses a multi-select list.</p>
        <Themes View={PickerBoard} />
        <div className="ui-lab-group">
          <h4>Mobile sheet, open</h4>
          <Meta source="components/common/PropertyPicker.tsx · components/ledger/ledger-workspace-clean.css" used="The sheet is the same PropertyPicker below 768px. Shown here in a 390px frame." />
          <FramePair view="picker-open" />
        </div>
        <div className="ui-lab-group">
          <h4>Mobile trigger, closed</h4>
          <FramePair view="picker" height={140} />
        </div>
        <div className="ui-lab-group">
          <h4>Overview chips</h4>
          <Meta source="app/page.tsx · components/dashboard/dashboard-operating.css" used="Overview mobile context. Hidden on wide screens by .dashboard-mobile-context." />
          <FramePair view="chips" height={120} />
        </div>
      </section>

      <section className="ui-lab-section">
        <h2>Segmented controls</h2>
        <p>The shared segmented control is restyled on the property page. Ledger uses a separate toggle. One older class is in the stylesheet and has no caller.</p>
        <Themes View={SegmentBoard} />
      </section>

      <section className="ui-lab-section">
        <h2>Status badges</h2>
        <p>Occupied and vacant are drawn two different ways. Portfolio vacant is negative. The unit page vacant badge is warning.</p>
        <Themes View={BadgeBoard} />
      </section>

      <section className="ui-lab-section">
        <h2>Notification popover</h2>
        <p>The bell opens the current popover. On a phone it becomes a sheet under the bell. The same feed is the Notifications page. These rows are sample alerts so the lab can open without a signed-in portfolio.</p>
        <Themes View={NotificationBoard} />
      </section>
    </div>
  );
}

function Themes({ View }: { View: () => React.ReactElement }) {
  return (
    <div className="ui-lab-themes">
      {(['light', 'dark'] as const).map((theme) => (
        <section key={theme} className="ui-lab-panel" data-theme={theme}>
          <h3>{theme === 'light' ? 'Light' : 'Dark'}</h3>
          <View />
        </section>
      ))}
    </div>
  );
}

function FramePair({ view, height }: { view: string; height?: number }) {
  return (
    <div className="ui-lab-themes">
      {(['light', 'dark'] as const).map((theme) => (
        <figure key={theme} className="ui-lab-frame" data-theme={theme}>
          <figcaption>{theme === 'light' ? 'Light' : 'Dark'}</figcaption>
          <iframe title={`${view} ${theme}`} src={`/ui-lab/embed?theme=${theme}&view=${view}`} style={height ? { height } : undefined} />
        </figure>
      ))}
    </div>
  );
}

function Meta({ source, used }: { source: string; used: string }) {
  return (
    <p className="ui-lab-meta">
      <code>{source}</code>
      <span>{used}</span>
    </p>
  );
}

function State({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="ui-lab-state"><span>{label}</span>{children}</div>;
}

function ButtonBoard() {
  return (
    <>
      <div className="ui-lab-group">
        <h4>Page action</h4>
        <Meta source="components/common/ProductControls.tsx · components/ui/Button.tsx · components/shared/product-controls.css" used="app/ledger/page.tsx, app/properties/page.tsx, app/utilities/page.tsx" />
        <div className="ui-lab-states">
          <State label="Default"><PageAction onClick={noop}>Add transaction</PageAction></State>
          <State label="Disabled"><PageAction onClick={noop} disabled>Add transaction</PageAction></State>
        </div>
      </div>
      <div className="ui-lab-group">
        <h4>Primary button</h4>
        <Meta source="components/ui/Button.tsx · components/ui/ui.css" used="components/ledger/DocumentsTab.tsx import action. Same fill as the page action, without the product-page-action class." />
        <div className="ui-lab-states">
          <State label="Default"><Button onClick={noop}>Import</Button></State>
          <State label="Disabled"><Button onClick={noop} disabled>Import</Button></State>
        </div>
      </div>
      <div className="ui-lab-group">
        <h4>Secondary</h4>
        <Meta source="components/common/ProductControls.tsx · components/ui/Button.tsx · components/shared/product-controls.css" used="SecondaryButton: PropertyEditModal.tsx, PropertyUnits.tsx. Plain Button secondary: ConnectedAccounts.tsx. Raw product-secondary-button: app/page.tsx retry." />
        <div className="ui-lab-states">
          <State label="SecondaryButton"><SecondaryButton onClick={noop}>Cancel</SecondaryButton></State>
          <State label="Button secondary"><Button variant="secondary" onClick={noop}>Cancel</Button></State>
          <State label="Disabled"><SecondaryButton onClick={noop} disabled>Cancel</SecondaryButton></State>
        </div>
      </div>
      <div className="ui-lab-group">
        <h4>Destructive</h4>
        <Meta source="components/ui/Button.tsx · components/ui/ui.css · components/account/account.css · components/transactions/transaction-modal.css" used="Button destructive: DocumentsTab.tsx, ConnectedAccounts.tsx. Outline: app/utilities/page.tsx. Archive text: AddTransactionModal.tsx." />
        <div className="ui-lab-states">
          <State label="Button"><Button variant="destructive" onClick={noop}>Archive</Button></State>
          <State label="Outline"><button type="button" className="product-destructive-outline">Archive utility</button></State>
          <State label="Text"><button type="button" className="transaction-archive-button">Delete transaction</button></State>
        </div>
      </div>
      <div className="ui-lab-group">
        <h4>Accent actions</h4>
        <Meta source="components/shared/workspace-common.css · components/transactions/transaction-modal.css · components/dashboard/dashboard-workspace.css · components/account/account.css" used="primary-action: app/page.tsx rent review, with inline padding. workspace-primary-button: PropertyEditModal.tsx, app/properties/page.tsx. quick-add-submit: AddTransactionModal.tsx, TransactionDetailModal.tsx. The accent rule in workspace-common.css overrides its text-on-page fill. pulse-add-button: app/page.tsx. actions-page-cta: app/actions/page.tsx." />
        <div className="ui-lab-states">
          <State label="Confirm"><button type="button" className="primary-action" style={reviewButton}>Confirm received</button></State>
          <State label="Save"><button type="button" className="workspace-primary-button">Save</button></State>
          <State label="Save disabled"><button type="button" className="workspace-primary-button" disabled>Save</button></State>
          <State label="Post"><button type="button" className="quick-add-submit">Post</button></State>
          <State label="Add"><button type="button" className="pulse-add-button"><Plus size={18} /><span>Add</span><ChevronDown size={16} aria-hidden="true" /></button></State>
          <State label="Actions"><span className="actions-page-cta">Review</span></State>
        </div>
      </div>
      <div className="ui-lab-group">
        <h4>Quiet and secondary pill</h4>
        <Meta source="components/ui/Button.tsx · components/shared/workspace-common.css" used="ui-button--quiet and .secondary-pill have styles and no current caller." />
        <div className="ui-lab-states">
          <State label="Quiet"><Button variant="quiet" onClick={noop}>View</Button></State>
          <State label="Secondary pill"><button type="button" className="secondary-pill">Filter</button></State>
        </div>
      </div>
    </>
  );
}

function PickerBoard() {
  const [ledger, setLedger] = useState('');
  const [overview, setOverview] = useState('');
  const [utilities, setUtilities] = useState<string[]>(['triskett']);

  function toggleUtility(id: string) {
    setUtilities((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  return (
    <>
      <div className="ui-lab-group">
        <h4>Ledger select</h4>
        <Meta source="components/common/PropertyPicker.tsx · components/ui/Select.tsx · components/shared/product-controls.css" used="components/ledger/LedgerTab.tsx, app/ledger/page.tsx. Wide screens show this select. The trigger beside it is hidden until 768px." />
        <div className="ui-lab-row"><PropertyPicker value={ledger} properties={LAB_PROPERTIES} onChange={setLedger} /></div>
      </div>
      <div className="ui-lab-group">
        <h4>Overview select</h4>
        <Meta source="components/common/ProductControls.tsx · app/page.tsx" used="Overview desktop filter. Same select, separate from PropertyPicker." />
        <div className="ui-lab-row">
          <ProductSelect aria-label="Property" value={overview} onChange={(event) => setOverview(event.target.value)}>
            <option value="">All properties</option>
            {LAB_PROPERTIES.map((property) => <option key={property.id} value={property.id}>{property.address}</option>)}
          </ProductSelect>
        </div>
      </div>
      <div className="ui-lab-group">
        <h4>Utility property list</h4>
        <Meta source="app/utilities/page.tsx · components/utilities/utilities-workspace.css" used="Add and edit utility. Multi-select, so more than one property can be on." />
        <div className="utility-property-picker">
          {LAB_PROPERTIES.map((property) => (
            <label key={property.id} className={`utility-property-option ${utilities.includes(property.id) ? 'selected' : ''}`}>
              <input type="checkbox" checked={utilities.includes(property.id)} onChange={() => toggleUtility(property.id)} />
              <span>{property.address}</span>
            </label>
          ))}
        </div>
      </div>
    </>
  );
}

function SegmentBoard() {
  const [section, setSection] = useState('overview');
  const [extra, setExtra] = useState('0');
  const [chart, setChart] = useState('cash');
  const [portfolio, setPortfolio] = useState('properties');
  const [ledger, setLedger] = useState<'ledger' | 'statements' | 'documents'>('ledger');
  const [view, setView] = useState<'table' | 'months'>('table');
  const [legacy, setLegacy] = useState('table');
  const sections = [{ value: 'overview', label: 'Overview' }, { value: 'improve', label: 'Improve' }, { value: 'units', label: 'Units' }, { value: 'documents', label: 'Documents' }] as const;

  return (
    <>
      <div className="ui-lab-group">
        <h4>Property sections</h4>
        <Meta source="components/common/ProductControls.tsx · components/ui/Tabs.tsx · components/property/property-workspace.css" used="app/properties/[id]/page.tsx. Selected hover switches to the page-action fill." />
        <SegmentedControl value={section} onChange={setSection} label="Property sections" className="property-subnav" options={sections} />
      </div>
      <div className="ui-lab-group">
        <h4>Mortgage amounts</h4>
        <Meta source="components/common/ProductControls.tsx · components/property/improve-controls.css" used="components/property/PropertyImprove.tsx" />
        <SegmentedControl value={extra} onChange={setExtra} label="Extra monthly principal" className="improve-mortgage-options" options={[{ value: '0', label: '$0' }, { value: '20', label: '+$20' }, { value: '50', label: '+$50' }, { value: '100', label: '+$100' }, { value: 'custom', label: 'Custom' }]} />
      </div>
      <div className="ui-lab-group">
        <h4>Chart modes</h4>
        <Meta source="components/property/property-workspace.css" used="No page adds property-chart-modes. The rules are ready for a segmented control." />
        <SegmentedControl value={chart} onChange={setChart} label="Chart mode" className="property-chart-modes" options={[{ value: 'cash', label: 'Cash' }, { value: 'income', label: 'Income' }, { value: 'expenses', label: 'Expenses' }]} />
      </div>
      <div className="ui-lab-group">
        <h4>Underline tabs</h4>
        <Meta source="components/common/ProductControls.tsx · components/ui/Tabs.tsx" used="app/properties/page.tsx desktop, app/ledger/page.tsx. The portfolio also renders SegmentedControl with portfolio-area-tabs-mobile, and property-preview.css hides that class." />
        <UnderlineTabs primary value={portfolio} onChange={setPortfolio} label="Portfolio sections" options={[{ value: 'properties', label: 'Properties' }, { value: 'units', label: 'Units' }, { value: 'improve', label: 'Improve' }]} />
        <div className="ui-lab-stack">
          <UnderlineTabs primary value={ledger} onChange={setLedger} label="Transaction sections" className="ledger-v230-tabs" options={[{ value: 'ledger', label: 'Transactions' }, { value: 'statements', label: 'Statements' }, { value: 'documents', label: 'Documents' }]} />
        </div>
      </div>
      <div className="ui-lab-group">
        <h4>Ledger view</h4>
        <Meta source="components/ledger/LedgerTab.tsx · components/ledger/ledger-workspace-clean.css" used="Transactions table and months. Selected state is aria-pressed, with a card fill." />
        <div className="ledger-view-toggle" role="group" aria-label="Ledger view">
          <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}>Table</button>
          <button type="button" aria-pressed={view === 'months'} onClick={() => setView('months')}>Months</button>
        </div>
      </div>
      <div className="ui-lab-group">
        <h4>Older segmented class</h4>
        <Meta source="components/shared/workspace-common.css" used="No component renders .segmented." />
        <div className="segmented" role="group" aria-label="Unused segmented">
          <button type="button" className={legacy === 'table' ? 'active' : ''} onClick={() => setLegacy('table')}>Table</button>
          <button type="button" className={legacy === 'months' ? 'active' : ''} onClick={() => setLegacy('months')}>Months</button>
        </div>
      </div>
    </>
  );
}

function BadgeBoard() {
  return (
    <>
      <div className="ui-lab-group">
        <h4>Portfolio unit status</h4>
        <Meta source="components/property/property-preview.css · components/property/PortfolioLists.tsx" used="Properties list. Vacant uses the negative color." />
        <div className="ui-lab-badges">
          <span className="portfolio-unit-status" data-kind="occupied">Occupied</span>
          <span className="portfolio-unit-status" data-kind="ending">Lease ending</span>
          <span className="portfolio-unit-status" data-kind="vacant">Vacant · 18 days</span>
          <span className="portfolio-unit-status" data-kind="move-in">Move-in</span>
        </div>
      </div>
      <div className="ui-lab-group">
        <h4>Unit page status</h4>
        <Meta source="components/property/property-workspace-foundations.css · components/property/PropertyUnits.tsx" used="Property units. Vacant uses the warning color. An earlier positive and review mix in the same file is overridden." />
        <div className="ui-lab-badges">
          <span className="unit-status occupied">Occupied</span>
          <span className="unit-status vacant">Vacant</span>
        </div>
      </div>
      <div className="ui-lab-group">
        <h4>Transaction status</h4>
        <Meta source="components/transactions/transaction-modal.css · components/transactions/TransactionDetailModal.tsx" used="Transaction detail. pending, review, and confirmed." />
        <div className="ui-lab-badges">
          <span className="transaction-status-chip" data-status="pending">Pending</span>
          <span className="transaction-status-chip" data-status="review">Needs review</span>
          <span className="transaction-status-chip" data-status="confirmed">Confirmed</span>
        </div>
      </div>
      <div className="ui-lab-group">
        <h4>Lease state</h4>
        <Meta source="components/property/PropertyUnits.tsx · components/shared/workspace-common.css · components/property/property-directories.css" used="Shown on an occupied unit when the short lease label is set. The tone class does not add its own color. The badge is the lease text at 76% opacity." />
        <div className="ui-lab-badges">
          <span className="unit-lease-summary good"><small className="lease-state-badge good">42 days left</small></span>
          <span className="unit-lease-summary warning"><small className="lease-state-badge warning">Ends today</small></span>
          <span className="unit-lease-summary danger"><small className="lease-state-badge danger">Expired</small></span>
        </div>
      </div>
      <div className="ui-lab-group">
        <h4>Sandbox</h4>
        <Meta source="components/account/account.css · components/account/ConnectedAccounts.tsx" used="Sandbox Test Bank on the account page." />
        <div className="ui-lab-badges"><em className="sandbox-badge">Sandbox</em></div>
      </div>
    </>
  );
}

function NotificationBoard() {
  return (
    <div className="ui-lab-group">
      <h4>Bell and drawer</h4>
      <Meta source="components/dashboard/NotificationBell.tsx · components/dashboard/NotificationFeed.tsx · components/dashboard/dashboard-operating.css" used="Bell: components/layout/PortfolioIdentity.tsx. Full feed: app/notifications/page.tsx." />
      <div className="ui-lab-stage">
        <NotificationBell contain startOpen />
      </div>
    </div>
  );
}
