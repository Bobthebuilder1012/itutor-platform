'use client';
import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function GroupDetailRedirect() {
  const router = useRouter();
  const params = useParams();
  const groupId = params?.groupId as string;
  useEffect(() => { if (groupId) router.replace(`/lessons/${groupId}`); }, [router, groupId]);
  return null;
}
