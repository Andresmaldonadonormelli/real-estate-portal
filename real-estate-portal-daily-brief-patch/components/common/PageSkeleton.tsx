'use client';

type Variant = 'dashboard' | 'properties' | 'ledger' | 'utilities' | 'account';

function Block({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`skeleton-block ${className}`} style={style} aria-hidden="true" />;
}

export default function PageSkeleton({ variant = 'ledger' }: { variant?: Variant }) {
  if (variant === 'dashboard') {
    return <div aria-label="Loading dashboard" role="status">
      <div className="skeleton-grid skeleton-grid-3" style={{ marginBottom: 14 }}>
        {[0,1,2].map(i => <Block key={i} style={{ height: 82 }} />)}
      </div>
      <div className="skeleton-grid skeleton-grid-4" style={{ marginBottom: 28 }}>
        {[0,1,2,3].map(i => <Block key={i} style={{ height: 90 }} />)}
      </div>
      <Block style={{ width: 150, height: 18, marginBottom: 14 }} />
      <div style={{ display:'grid', gap:12, marginBottom:28 }}>
        {[0,1].map(i => <div key={i} className="skeleton-card-row"><Block style={{ width:72, height:58, flex:'0 0 auto' }} /><div style={{ flex:1, minWidth:0 }}><Block style={{ width:'42%', height:17, marginBottom:9 }} /><Block style={{ width:'65%', height:12 }} /></div><Block style={{ width:90, height:28 }} /></div>)}
      </div>
      <Block style={{ width:130, height:18, marginBottom:14 }} />
      <Block style={{ height:210 }} />
    </div>;
  }

  if (variant === 'properties') {
    return <div aria-label="Loading properties" role="status" style={{ display:'grid', gap:18 }}>
      {[0,1].map(i => <div key={i} className="skeleton-card-row" style={{ minHeight:160, alignItems:'flex-start' }}><Block style={{ width:150, height:108, flex:'0 0 auto' }} /><div style={{ flex:1 }}><Block style={{ width:'44%', height:22, marginBottom:10 }} /><Block style={{ width:'32%', height:13, marginBottom:20 }} /><div className="skeleton-grid skeleton-grid-3"><Block style={{height:50}}/><Block style={{height:50}}/><Block style={{height:50}}/></div></div></div>)}
    </div>;
  }

  if (variant === 'utilities') {
    return <div aria-label="Loading utilities" role="status">
      <Block style={{ width:300, height:42, marginBottom:18 }} />
      <div className="skeleton-grid skeleton-grid-3">
        {[0,1,2].map(i => <Block key={i} style={{ height:210 }} />)}
      </div>
    </div>;
  }

  if (variant === 'account') {
    return <div aria-label="Loading account" role="status"><Block style={{ height:96, marginBottom:16 }} /><Block style={{ width:96, height:40 }} /></div>;
  }

  return <div aria-label="Loading ledger" role="status">
    <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:18 }}><Block style={{ width:104, height:40 }} /><Block style={{ width:138, height:40 }} /></div>
    <Block style={{ height:74, marginBottom:14 }} />
    <div style={{ display:'grid', gap:12 }}><Block style={{ height:126 }} /><Block style={{ height:126 }} /><Block style={{ height:126 }} /></div>
  </div>;
}
