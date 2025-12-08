import { Suspense } from 'react';
import { getAuthRequired } from '@/lib/fetchers';
import RepoWikiClient from './RepoWikiClient';

export default async function RepoWikiPage() {
  const authRequired = await getAuthRequired();
  return (
    <Suspense>
      <RepoWikiClient authRequiredInitial={authRequired} />
    </Suspense>
  );
}
