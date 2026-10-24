'use client';
import { memo, startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { Landmark, MoreHorizontal, RefreshCw } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';
import { ProductSelect } from '@/components/common/ProductControls';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/formatters';
import { accountStatus, needsReconnect } from '@/lib/plaid/accountStatus';

type Item={id:string;institution_id:string|null;institution_name:string;status:string;error_code:string|null;error_message:string|null;last_synced_at:string|null};
type Account={id:string;item_id:string;name:string;official_name:string|null;mask:string|null;type:string;subtype:string|null;current_balance:number|null;property_id:string|null;import_enabled:boolean};
type Property={id:string;address:string};
type Bank={key:string;name:string;items:Item[];accounts:Account[];disconnected:Account[];lastSynced:string|null;error:string|null;reconnectItem:Item|null;primaryItem:Item|null};
type Menu={key:string;confirm:boolean}|null;

const institutionKey=(item:Item)=>item.institution_id||`name:${item.institution_name}`;
const accountLabel=(account:Account)=>`${account.official_name||account.name}${account.mask?` •••• ${account.mask}`:''}`;
const message=(error:unknown,fallback:string)=>error instanceof Error?error.message:fallback;

/** One section per bank, even when a reconnect left more than one Plaid connection behind it. */
function groupBanks(items:Item[],accounts:Account[],disconnected:Account[]):Bank[]{
  const banks=new Map<string,Bank>();
  for(const item of items){
    const key=institutionKey(item);
    const bank=banks.get(key)||{key,name:item.institution_name,items:[],accounts:[],disconnected:[],lastSynced:null,error:null,reconnectItem:null,primaryItem:null};
    bank.items.push(item);
    bank.name=item.institution_name;
    if(item.last_synced_at&&(!bank.lastSynced||item.last_synced_at>bank.lastSynced))bank.lastSynced=item.last_synced_at;
    banks.set(key,bank);
  }
  const bankByItem=new Map<string,Bank>();
  banks.forEach(bank=>bank.items.forEach(item=>bankByItem.set(item.id,bank)));
  for(const account of accounts)bankByItem.get(account.item_id)?.accounts.push(account);
  for(const account of disconnected)bankByItem.get(account.item_id)?.disconnected.push(account);
  banks.forEach(bank=>{
    const used=bank.items.filter(item=>[...bank.accounts,...bank.disconnected].some(account=>account.item_id===item.id));
    bank.error=used.find(item=>item.error_message&&bank.accounts.some(account=>account.item_id===item.id))?.error_message||null;
    bank.reconnectItem=used.find(item=>needsReconnect(item))||null;
    bank.primaryItem=bank.reconnectItem||used[used.length-1]||bank.items[bank.items.length-1]||null;
  });
  return [...banks.values()];
}

type RowProps={account:Account;properties:Property[];saving:boolean;syncing:boolean;connectionStatus:string|null;connectionErrorCode:string|null;menu:'closed'|'open'|'confirm';onAssign:(id:string,propertyId:string)=>void;onMenu:(key:string|null,confirm?:boolean)=>void;onDisconnect:(id:string)=>void;onReconnect:(itemId:string)=>void};

const AccountRow=memo(function AccountRow({account,properties,saving,syncing,connectionStatus,connectionErrorCode,menu,onAssign,onMenu,onDisconnect,onReconnect}:RowProps){
  const status=accountStatus({propertyId:account.property_id,importEnabled:account.import_enabled,saving,syncing,connectionStatus,connectionErrorCode});
  const reconnect=needsReconnect({status:connectionStatus,error_code:connectionErrorCode});
  const menuKey=`account:${account.id}`;
  return <div className="connected-bank-account">
    <div className="connected-account-copy"><strong>{accountLabel(account)}</strong><span>{account.subtype||account.type} · {formatCurrency(account.current_balance||0)}</span><em className={status.tone}>{status.label}</em></div>
    <div className="connected-account-controls">
      <ProductSelect label="Assigned property" aria-label={`Property for ${accountLabel(account)}`} aria-busy={saving} value={account.property_id||''} onChange={event=>onAssign(account.id,event.target.value)}><option value="">Not assigned</option>{properties.map(property=><option value={property.id} key={property.id}>{property.address}</option>)}</ProductSelect>
      <div className="connected-bank-menu">
        <button onClick={()=>onMenu(menu==='closed'?menuKey:null)} aria-label={`Options for ${accountLabel(account)}`} aria-expanded={menu!=='closed'}><MoreHorizontal size={18}/></button>
        {menu==='open'&&<div className="connected-menu-list" role="menu">{reconnect&&<button role="menuitem" onClick={()=>{onMenu(null);onReconnect(account.item_id)}}>Reconnect account</button>}<button role="menuitem" className="danger" onClick={()=>onMenu(menuKey,true)}>Disconnect account</button></div>}
        {menu==='confirm'&&<div className="connected-confirm" role="dialog" aria-label={`Disconnect ${accountLabel(account)}`}><p>Stop importing {accountLabel(account)}? The rest of this bank stays connected. Imported history, categories, and the property assignment are kept.</p><div><button onClick={()=>onMenu(null)}>Cancel</button><button className="danger" onClick={()=>onDisconnect(account.id)}>Disconnect account</button></div></div>}
      </div>
    </div>
  </div>;
});

const DisconnectedRow=memo(function DisconnectedRow({account,propertyName,restoring,onRestore}:{account:Account;propertyName:string|null;restoring:boolean;onRestore:(id:string)=>void}){
  return <div className="connected-bank-account">
    <div className="connected-account-copy"><strong>{accountLabel(account)}</strong><span>{account.subtype||account.type} · {propertyName||'Not assigned'}</span><em className={restoring?'pending':'inactive'}>{restoring?'Restoring…':'Disconnected'}</em></div>
    <div className="connected-account-controls"><button className="connected-sync" onClick={()=>onRestore(account.id)} disabled={restoring} aria-busy={restoring}>{restoring?'Restoring…':'Restore'}</button></div>
  </div>;
});

export default function ConnectedAccounts(){
  const {session}=useAuth();
  const [items,setItems]=useState<Item[]>([]);
  const [accounts,setAccounts]=useState<Account[]>([]);
  const [properties,setProperties]=useState<Property[]>([]);
  const [sandbox,setSandbox]=useState(false);
  const [testProperty,setTestProperty]=useState('');
  const [linkToken,setLinkToken]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [menu,setMenu]=useState<Menu>(null);
  const [saving,setSaving]=useState<Record<string,boolean>>({});
  const [syncing,setSyncing]=useState<Record<string,boolean>>({});
  const [disconnected,setDisconnected]=useState<Account[]>([]);
  const [restoring,setRestoring]=useState<Record<string,boolean>>({});
  const [reconnecting,setReconnecting]=useState<string|null>(null);
  const linkMode=useRef<{kind:'new'}|{kind:'update';itemId:string;bankName:string}>({kind:'new'});
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const accountsRef=useRef(accounts);accountsRef.current=accounts;
  const itemsRef=useRef(items);itemsRef.current=items;
  const versions=useRef(new Map<string,number>());

  const headers=useMemo(()=>({Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'}),[session.access_token]);
  const request=useCallback(async(path:string,init:RequestInit={},retry=true):Promise<any>=>{
    const response=await fetch(path,{...init,headers:{...headers,...init.headers}});
    if(response.status===401&&retry){const refreshed=await supabase.auth.refreshSession();const token=refreshed.data.session?.access_token;if(token)return request(path,{...init,headers:{...init.headers,Authorization:`Bearer ${token}`}},false)}
    const json=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(json.error||(response.status===504?'The bank took too long to respond. Imported transactions are safe; try Sync again.':`Request failed (${response.status}${response.statusText?` ${response.statusText}`:''}).`));
    return json;
  },[headers]);
  const load=useCallback(async()=>{
    const [connected,propertyRows]=await Promise.all([request('/api/plaid/accounts'),supabase.from('properties').select('id,address').is('archived_at',null).order('address')]);
    startTransition(()=>{
      setItems(connected.items||[]);
      setDisconnected(connected.disconnected||[]);
      setAccounts(current=>{const inFlight=new Map(current.filter(row=>versions.current.has(row.id)).map(row=>[row.id,row]));return (connected.accounts||[]).map((row:Account)=>inFlight.get(row.id)||row)});
      setSandbox(Boolean(connected.sandbox));
      if(!propertyRows.error){const rows=(propertyRows.data||[]) as Property[];setProperties(rows);setTestProperty(value=>value||rows[0]?.id||'')}
    });
  },[request]);
  const refresh=useCallback(()=>{load().catch(e=>setError(message(e,'Could not refresh bank accounts.')))},[load]);
  useEffect(()=>{refresh()},[refresh]);
  useEffect(()=>{if(!notice)return;const timer=window.setTimeout(()=>setNotice(''),4000);return()=>window.clearTimeout(timer)},[notice]);
  useEffect(()=>{
    if(!menu)return;
    const close=(event:PointerEvent)=>{if(!(event.target instanceof Element)||!event.target.closest('.connected-bank-menu'))setMenu(null)};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setMenu(null)};
    document.addEventListener('pointerdown',close);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',escape)};
  },[menu]);

  const createLink=async()=>{setBusy(true);setError('');setNotice('');try{const data=await request('/api/plaid/link-token',{method:'POST'});linkMode.current={kind:'new'};setLinkToken(data.link_token)}catch(e){setError(message(e,'Could not start Plaid.'))}finally{setBusy(false)}};
  const reconnect=useCallback(async(itemId:string)=>{
    const item=itemsRef.current.find(row=>row.id===itemId);
    setMenu(null);setError('');setNotice('');setReconnecting(itemId);
    try{
      const data=await request('/api/plaid/link-token',{method:'POST',body:JSON.stringify({itemId})});
      linkMode.current={kind:'update',itemId,bankName:item?.institution_name||'Your bank'};
      setLinkToken(data.link_token);
    }catch(e){setReconnecting(null);setError(message(e,'Could not start reconnecting.'))}
  },[request]);
  const onSuccess=useCallback(async(publicToken:string,metadata:any)=>{
    const mode=linkMode.current;
    linkMode.current={kind:'new'};
    if(mode.kind==='update'){
      setLinkToken(null);
      try{
        const result=await request(`/api/plaid/items/${mode.itemId}/reconnect`,{method:'POST'});
        const restored=result.restored||0;
        setNotice(`${mode.bankName} reconnected. Property assignments and history were kept${restored?`; ${restored} account${restored===1?'':'s'} resumed importing`:''}. New activity will sync shortly.`);
        await load();
      }catch(e){setError(message(e,`Could not finish reconnecting ${mode.bankName}.`))}
      finally{setReconnecting(null)}
      return;
    }
    setBusy(true);setError('');
    try{
      const selectedAccountIds=(metadata.accounts||[]).map((account:any)=>account.id||account.account_id).filter(Boolean);
      const result=await request('/api/plaid/exchange',{method:'POST',body:JSON.stringify({publicToken,institution:metadata.institution,selectedAccountIds})});
      setLinkToken(null);
      const count=result.accountCount||0;const restored=result.restored||0;
      setNotice(restored?`${count} account${count===1?'':'s'} connected. ${restored} kept ${restored===1?'its':'their'} property and resumed importing.`:`${count} account${count===1?'':'s'} connected. Choose a property to begin importing.`);
      await load();
    }catch(e){setError(message(e,'Could not link bank.'))}finally{setBusy(false)}
  },[request,load]);
  const onExit=useCallback((exitError:any)=>{
    const mode=linkMode.current;
    linkMode.current={kind:'new'};
    setLinkToken(null);setReconnecting(null);
    if(exitError)setError(`${exitError.display_message||exitError.error_message||'Plaid closed before finishing.'}${exitError.error_code?` (${exitError.error_code})`:''}`);
    else if(mode.kind==='update')setNotice(`${mode.bankName} still needs to be reconnected before it can sync.`);
  },[]);
  const plaid=usePlaidLink({token:linkToken,onSuccess,onExit});useEffect(()=>{if(linkToken&&plaid.ready)plaid.open()},[linkToken,plaid.ready,plaid.open]);

  const onMenu=useCallback((key:string|null,confirm=false)=>setMenu(key?{key,confirm}:null),[]);

  const assign=useCallback((id:string,propertyId:string)=>{
    const previous=accountsRef.current.find(row=>row.id===id);
    if(!previous||(previous.property_id||'')===propertyId)return;
    const version=(versions.current.get(id)||0)+1;
    versions.current.set(id,version);
    setError('');setNotice('');
    setAccounts(rows=>rows.map(row=>row.id===id?{...row,property_id:propertyId||null,import_enabled:Boolean(propertyId)}:row));
    setSaving(state=>({...state,[id]:true}));
    const latest=()=>versions.current.get(id)===version;
    const settle=()=>{if(!latest())return;versions.current.delete(id);setSaving(state=>{const next={...state};delete next[id];return next})};
    request(`/api/plaid/accounts/${id}`,{method:'PATCH',body:JSON.stringify({propertyId:propertyId||null})})
      .then(result=>{if(!latest())return;if(result.account)setAccounts(rows=>rows.map(row=>row.id===id?{...row,...result.account}:row));setNotice(propertyId?`${accountLabel(previous)} now imports to this property.`:`${accountLabel(previous)} is not assigned. Its activity stays out of the ledger.`)})
      .catch(e=>{if(!latest())return;setAccounts(rows=>rows.map(row=>row.id===id?previous:row));setError(`${message(e,'Could not update the property.')} ${accountLabel(previous)} was set back.`)})
      .finally(settle);
  },[request]);

  const disconnectAccount=useCallback((id:string)=>{
    const index=accountsRef.current.findIndex(row=>row.id===id);
    const previous=accountsRef.current[index];
    if(!previous)return;
    setMenu(null);setError('');setNotice('');
    setAccounts(rows=>rows.filter(row=>row.id!==id));
    request(`/api/plaid/accounts/${id}`,{method:'DELETE'})
      .then(()=>{setDisconnected(rows=>[...rows.filter(row=>row.id!==id),{...previous,import_enabled:false}]);setNotice(`${accountLabel(previous)} disconnected. Imported history was kept; use Restore to reconnect it.`)})
      .catch(e=>{setAccounts(rows=>rows.some(row=>row.id===id)?rows:[...rows.slice(0,index),previous,...rows.slice(index)]);setError(`${message(e,'Could not disconnect the account.')} ${accountLabel(previous)} is still connected.`)});
  },[request]);

  const disconnectBank=useCallback((bank:Bank)=>{
    const itemIds=new Set(bank.items.map(item=>item.id));
    setMenu(null);setError('');setNotice('');
    setItems(rows=>rows.filter(row=>!itemIds.has(row.id)));
    setAccounts(rows=>rows.filter(row=>!itemIds.has(row.item_id)));
    Promise.all([...itemIds].map(id=>request(`/api/plaid/items/${id}`,{method:'DELETE'})))
      .then(()=>setNotice(`${bank.name} disconnected. Imported history, categories, and property assignments were kept.`))
      .catch(e=>{setError(`${message(e,`Could not disconnect ${bank.name}.`)} It is still connected.`);refresh()});
  },[request,refresh]);

  const sync=useCallback((bank:Bank)=>{
    const itemIds=bank.items.filter(item=>!needsReconnect(item)&&bank.accounts.some(account=>account.item_id===item.id)).map(item=>item.id);
    if(!itemIds.length||itemIds.some(id=>syncing[id]))return;
    setError('');setNotice('');
    setSyncing(state=>({...state,...Object.fromEntries(itemIds.map(id=>[id,true]))}));
    const controller=new AbortController();
    const timer=window.setTimeout(()=>controller.abort(),75_000);
    request('/api/plaid/sync',{method:'POST',body:JSON.stringify({itemIds}),signal:controller.signal})
      .then(result=>{
        const rows:any[]=result.results||[];
        const failed=rows.filter(row=>!row.ok);
        if(failed.length){
          setItems(current=>current.map(item=>{const failure=failed.find(row=>row.itemId===item.id);return failure?{...item,status:failure.reconnectRequired||needsReconnect({error_code:failure.code})?'needs_reauth':item.status,error_code:failure.code||'SYNC_FAILED',error_message:failure.error}:item}));
          setError(failed.map(row=>{const masks=bank.accounts.filter(account=>account.item_id===row.itemId&&account.mask).map(account=>`••••${account.mask}`);return `${bank.name}${masks.length?` ${masks.join(', ')}`:''}: ${row.error}`}).join(' '));
        }
        const created=rows.reduce((sum,row)=>sum+(row.created||0),0);
        const refreshing=rows.some(row=>row.refreshRequested);
        if(failed.length<rows.length)setNotice(created?`${created} ${bank.name} transaction${created===1?'':'s'} added to your ledger.`:refreshing?`Checking ${bank.name} for new transactions. They will show up in your ledger shortly.`:`${bank.name} is up to date.`);
        return load();
      })
      .catch(e=>setError(controller.signal.aborted?`${bank.name} is taking too long to respond. Imported transactions are safe; try Sync again.`:message(e,`Could not sync ${bank.name}.`)))
      .finally(()=>{window.clearTimeout(timer);setSyncing(state=>{const next={...state};itemIds.forEach(id=>delete next[id]);return next})});
  },[request,load,syncing]);

  const createTest=async()=>{if(!testProperty){setError('Choose a property for the Sandbox test.');return}setBusy(true);setError('');setNotice('');try{const result=await request('/api/plaid/sandbox-transaction',{method:'POST',body:JSON.stringify({propertyId:testProperty})});setNotice(result.message||'Sandbox test is ready.');await load()}catch(e){setError(message(e,'Could not create the Sandbox test.'))}finally{setBusy(false)}};
  const resetSandbox=async()=>{if(!confirm('Reset Sandbox Test Bank? This removes only its test accounts and imported sample transactions.'))return;setBusy(true);setError('');try{await request('/api/plaid/sandbox-reset',{method:'POST'});setNotice('Sandbox test data reset.');await load()}catch(e){setError(message(e,'Could not reset Sandbox data.'))}finally{setBusy(false)}};

  const restore=useCallback((id:string)=>{
    setError('');setNotice('');
    setRestoring(state=>({...state,[id]:true}));
    request(`/api/plaid/accounts/${id}/restore`,{method:'POST'})
      .then(result=>{
        const account=result.account as Account;
        const reconnectFirst=needsReconnect(itemsRef.current.find(item=>item.id===account.item_id)||{});
        setDisconnected(rows=>rows.filter(row=>row.id!==id));
        setAccounts(rows=>[...rows.filter(row=>row.id!==account.id),account]);
        const property=properties.find(row=>row.id===account.property_id)?.address;
        setNotice(`${accountLabel(account)} restored${property?` to ${property}${result.inferredProperty?' (from its imported history)':''}`:'. Choose a property to resume importing'}.${reconnectFirst?' Reconnect the bank to resume syncing.':''}`);
        return load();
      })
      .catch(e=>setError(message(e,'Could not restore the account.')))
      .finally(()=>setRestoring(state=>{const next={...state};delete next[id];return next}));
  },[request,load,properties]);

  const banks=useMemo(()=>groupBanks(items,accounts,disconnected),[items,accounts,disconnected]);
  const propertyNames=useMemo(()=>new Map(properties.map(property=>[property.id,property.address])),[properties]);

  return <section className="connected-accounts-setting">
    <div className="connected-accounts-head"><div><strong>Bank accounts</strong><span>Assign each account to a property before activity enters your ledger.</span></div><Button variant="secondary" onClick={createLink} disabled={busy}>{busy?'Please wait…':'Link bank'}</Button></div>
    {error&&<p className="connected-accounts-error" role="alert">{error}</p>}{notice&&<p className="connected-accounts-notice" role="status">{notice}</p>}
    <div className="connected-bank-list">{banks.map(bank=>{
      const bankMenu=`bank:${bank.key}`;const isSyncing=bank.items.some(item=>syncing[item.id]);const connections=new Map(bank.items.map(item=>[item.id,item]));
      const canSync=bank.items.some(item=>!needsReconnect(item)&&bank.accounts.some(account=>account.item_id===item.id));
      const isReconnecting=Boolean(reconnecting&&bank.items.some(item=>item.id===reconnecting));
      return <section className="connected-bank" key={bank.key}>
        <header className="connected-bank-title">
          <div className="connected-bank-identity"><Landmark size={20}/><div><span className="connected-bank-heading"><strong>{bank.name}</strong>{bank.name==='Sandbox Test Bank'&&<em className="sandbox-badge">Sandbox</em>}</span>{bank.reconnectItem&&!isSyncing?<span className="connected-bank-alert" role="status">Reconnect required{bank.reconnectItem.error_code?` · ${bank.reconnectItem.error_code}`:''}</span>:<span aria-live="polite">{isSyncing?'Syncing…':bank.lastSynced?`Synced ${new Date(bank.lastSynced).toLocaleString()}`:'Connected'}{bank.error&&!isSyncing?` · ${bank.error}`:''}</span>}</div></div>
          <div className="connected-bank-actions">
            {bank.reconnectItem&&!canSync
              ?<button className="connected-sync" onClick={()=>reconnect(bank.reconnectItem!.id)} disabled={isReconnecting} aria-busy={isReconnecting}><RefreshCw size={16}/>{isReconnecting?'Opening…':'Reconnect'}</button>
              :<button className="connected-sync" onClick={()=>sync(bank)} disabled={isSyncing||!canSync} aria-busy={isSyncing}><RefreshCw size={16}/>{isSyncing?'Syncing…':'Sync'}</button>}
            <div className="connected-bank-menu">
              <button onClick={()=>onMenu(menu?.key===bankMenu?null:bankMenu)} aria-label={`Options for ${bank.name}`} aria-expanded={menu?.key===bankMenu}><MoreHorizontal size={18}/></button>
              {menu?.key===bankMenu&&!menu.confirm&&<div className="connected-menu-list" role="menu">{bank.primaryItem&&<button role="menuitem" onClick={()=>reconnect(bank.primaryItem!.id)} disabled={isReconnecting}>Reconnect {bank.name}</button>}<button role="menuitem" className="danger" onClick={()=>onMenu(bankMenu,true)}>Disconnect {bank.name}</button></div>}
              {menu?.key===bankMenu&&menu.confirm&&<div className="connected-confirm" role="dialog" aria-label={`Disconnect ${bank.name}`}><p>Disconnect {bank.name}? Every {bank.name} account stops importing. Imported history, categories, and property assignments are kept.</p><div><button onClick={()=>onMenu(null)}>Cancel</button><button className="danger" onClick={()=>disconnectBank(bank)}>Disconnect {bank.name}</button></div></div>}
            </div>
          </div>
        </header>
        <div className="connected-bank-accounts">{bank.accounts.map(account=>{const key=`account:${account.id}`;return <AccountRow key={account.id} account={account} properties={properties} saving={Boolean(saving[account.id])} syncing={Boolean(syncing[account.item_id])} connectionStatus={connections.get(account.item_id)?.status||null} connectionErrorCode={connections.get(account.item_id)?.error_code||null} menu={menu?.key===key?(menu.confirm?'confirm':'open'):'closed'} onAssign={assign} onMenu={onMenu} onDisconnect={disconnectAccount} onReconnect={reconnect}/>})}{bank.disconnected.map(account=><DisconnectedRow key={account.id} account={account} propertyName={account.property_id?propertyNames.get(account.property_id)||null:null} restoring={Boolean(restoring[account.id])} onRestore={restore}/>)}</div>
      </section>;
    })}</div>
    {!banks.length&&!error&&<p className="connected-accounts-empty">No banks linked yet.</p>}
    {sandbox&&<section className="connected-sandbox-tools"><div><strong>Testing tools</strong><span>Create a Sandbox Test Bank account and one $64 imported expense.</span></div><ProductSelect label="Assigned property" aria-label="Property for Sandbox test" value={testProperty} onChange={event=>setTestProperty(event.target.value)}><option value="">Choose property</option>{properties.map(property=><option value={property.id} key={property.id}>{property.address}</option>)}</ProductSelect><Button variant="secondary" onClick={createTest} disabled={busy||!testProperty}>Create test transaction</Button><Button variant="destructive" onClick={resetSandbox} disabled={busy}>Reset Sandbox data</Button></section>}
  </section>;
}
