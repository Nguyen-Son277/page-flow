import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { needsSetup } from '@/lib/accounts';
import { Workspace } from '@/components/workspace';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const user = await currentUser();
  if (!user) {
    if (await needsSetup()) redirect('/setup');
    redirect('/login');
  }
  return <Workspace user={{ id: user.id, name: user.name, email: user.email, role: user.role, csrf: user.csrf }} />;
}
