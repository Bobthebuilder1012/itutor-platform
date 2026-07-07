'use client';

import { Wrench } from 'lucide-react';

export default function AiMaintenanceNotice() {
  return (
    <div style={{minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'1rem',textAlign:'center',background:'#f9fafb'}}>
      <div style={{maxWidth:'28rem',gap:'1.25rem',display:'flex',flexDirection:'column',alignItems:'center'}}>
        <div style={{width:'5rem',height:'5rem',borderRadius:'1.5rem',background:'#f3f4f6',display:'grid',placeItems:'center'}}>
          <Wrench size={32} color="#6b7280" />
        </div>
        <div style={{display:'inline-flex',alignItems:'center',gap:'0.375rem',padding:'0.25rem 0.75rem',borderRadius:'9999px',background:'#fef3c7',color:'#92400e',fontSize:'0.75rem',fontWeight:'700',textTransform:'uppercase',letterSpacing:'0.05em'}}>
          <span style={{width:'0.375rem',height:'0.375rem',borderRadius:'9999px',background:'#f59e0b',display:'inline-block'}} />
          Under Maintenance
        </div>
        <h1 style={{fontSize:'1.875rem',fontWeight:'700',color:'#111827',margin:0}}>iTutor AI is in maintenance</h1>
        <p style={{color:'#6b7280',lineHeight:'1.625',margin:0}}>Sorry for any inconvenience. We are working to get things back up and running as soon as possible.</p>
        <p style={{fontSize:'0.75rem',color:'#9ca3af',margin:0}}>Please check back later. If you need urgent help, contact support.</p>
      </div>
    </div>
  );
}
