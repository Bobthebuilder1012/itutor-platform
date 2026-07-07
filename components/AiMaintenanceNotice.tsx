'use client';

/**
 * @param embedded - render inside an app shell (transparent background, centers
 *   within the content area) rather than as a full-viewport standalone screen.
 */
export default function AiMaintenanceNotice({ embedded = false }: { embedded?: boolean }) {
  const outer = embedded
    ? {minHeight:'calc(100vh - 12rem)',display:'flex',flexDirection:'column' as const,alignItems:'center',justifyContent:'center',padding:'1rem',textAlign:'center' as const}
    : {minHeight:'100vh',display:'flex',flexDirection:'column' as const,alignItems:'center',justifyContent:'center',padding:'1rem',textAlign:'center' as const,background:'#f9fafb'};
  return (
    <div style={outer}>
      <div style={{maxWidth:'28rem',gap:'1.25rem',display:'flex',flexDirection:'column',alignItems:'center'}}>
        <div style={{width:'5rem',height:'5rem',borderRadius:'1.5rem',background:'#f3f4f6',display:'grid',placeItems:'center'}}>
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <circle cx="11.5" cy="13" r="5.5" fill="#4b5563" />
            <path d="M15 30 L 27.5 11.5" stroke="#4b5563" strokeWidth="8.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
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
