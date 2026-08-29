'use client';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/auth/AuthContext';

export default function AccountPage(){
  const { user } = useAuth();
  return <div style={{padding:24,maxWidth:1200,margin:'0 auto'}}><h1 style={{fontSize:28,marginBottom:24,fontWeight:500}}>Account Settings</h1><div className="card" style={{padding:20,marginBottom:16}}><div style={{fontSize:12,color:'var(--text-secondary)',marginBottom:5}}>Signed in as</div><div style={{fontSize:17}}>{user.email || 'Signed in'}</div></div><button onClick={()=>supabase.auth.signOut()} style={{padding:'10px 14px',border:'1px solid var(--danger)',borderRadius:8,background:'transparent',color:'var(--danger)',cursor:'pointer',fontWeight:600}}>Sign out</button></div>
}
