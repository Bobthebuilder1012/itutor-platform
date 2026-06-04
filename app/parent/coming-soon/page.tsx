'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';

export default function ParentComingSoonPage() {
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut({ scope: 'local' });
    window.location.href = '/';
  };

  return (
    <div style={{minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'1rem',textAlign:'center',background:'#f9fafb'}}>
      <div style={{maxWidth:'28rem',gap:'1.5rem',display:'flex',flexDirection:'column',alignItems:'center'}}>
        <div style={{width:'5rem',height:'5rem',borderRadius:'1.5rem',background:'#fef3c7',display:'grid',placeItems:'center',fontSize:'2.5rem'}}>🕐</div>
        <div style={{display:'inline-flex',alignItems:'center',gap:'0.375rem',padding:'0.25rem 0.75rem',borderRadius:'9999px',background:'#fef3c7',color:'#92400e',fontSize:'0.75rem',fontWeight:'700',textTransform:'uppercase',letterSpacing:'0.05em'}}>Coming Soon</div>
        <h1 style={{fontSize:'1.875rem',fontWeight:'700',color:'#111827',margin:0}}>Parent accounts are coming soon</h1>
        <p style={{color:'#6b7280',lineHeight:'1.625',margin:0}}>We are working hard to bring parent accounts to iTutor. Soon you will be able to manage your children&apos;s classes, approve enrolments, and track their progress.</p>
        <div style={{borderRadius:'1rem',border:'1px solid #e5e7eb',background:'white',padding:'1.25rem',textAlign:'left',width:'100%'}}>
          <div style={{fontWeight:'600',color:'#111827',marginBottom:'0.75rem',fontSize:'0.875rem'}}>What&apos;s coming for parents:</div>
          {['Manage your children\'s student accounts','Approve and pay for class enrolments','View monthly tutor feedback reports','Track attendance and progress'].map(function(item){return(
            <div key={item} style={{display:'flex',alignItems:'flex-start',gap:'0.5rem',fontSize:'0.875rem',color:'#6b7280',marginBottom:'0.5rem'}}>
              <span style={{color:'#10b981',flexShrink:0}}>✓</span>{item}
            </div>
          )})}
        </div>
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          style={{display:'inline-flex',alignItems:'center',gap:'0.5rem',padding:'0.75rem 1.5rem',borderRadius:'1rem',background:'#199356',color:'white',fontWeight:'600',border:'none',cursor:signingOut?'not-allowed':'pointer',fontSize:'0.875rem',opacity:signingOut?0.6:1,width:'100%',justifyContent:'center'}}
        >
          {signingOut ? 'Signing out…' : '← Sign out & return to iTutor'}
        </button>
        <p style={{fontSize:'0.75rem',color:'#9ca3af',margin:0}}>
          Already have a student or tutor account?{' '}
          <a href="/login" style={{color:'#199356',fontWeight:'600',textDecoration:'none'}}>Sign in here</a>
        </p>
      </div>
    </div>
  );
}
