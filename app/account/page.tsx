'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function AccountPage(){
  const [email,setEmail]=useState('');
  useEffect(()=>{supabase.auth.getUser().then(({data})=>setEmail(data.user?.email||''));},[]);
  return <div style={{padding:24,maxWidth:900,margin:'0 auto'}}><h1 style={{fontSize:28,marginBottom:24,fontWeight:500}}>Account Settings</h1><div className="card" style={{padding:20,marginBottom:16}}><div style={{fontSize:12,color:'var(--text-secondary)',marginBottom:5}}>Signed in as</div><div style={{fontSize:17}}>{email||'Loading…'}</div></div><button onClick={()=>supabase.auth.signOut()} style={{padding:'10px 14px',border:'1px solid var(--danger)',borderRadius:8,background:'transparent',color:'var(--danger)',cursor:'pointer',fontWeight:600}}>Sign out</button></div>
}
