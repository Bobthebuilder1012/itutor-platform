import { NextResponse } from 'next/server';
import { metadata } from '@/app/layout';

// #region agent log - version check endpoint
const LOG_ENDPOINT = 'http://127.0.0.1:7242/ingest/96e0dc54-0d29-41a7-8439-97ee7ad5934e';
// #endregion

export async function GET() {
  const versionInfo = {
    buildTime: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV,
    ogImageFromMetadata: (metadata.openGraph?.images as any)?.[0]?.url,
    metadataKeys: Object.keys(metadata),
  };
  
  // #region agent log - version endpoint called
  fetch(LOG_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'debug-version/route.ts',message:'Version endpoint called',data:versionInfo,timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  
  return NextResponse.json(versionInfo);
}
