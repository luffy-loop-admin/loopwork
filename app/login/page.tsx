import { redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/auth';
import LoginForm from './LoginForm';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  if (await getSessionProfile()) redirect('/');
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-10">
      <h1 className="text-2xl font-semibold">Guest Post Portal</h1>
      <p className="mt-1 text-sm text-muted">Sign in to find sites and prices.</p>
      {error === 'no-access' && (
        <p role="alert" className="mt-4 rounded-md bg-bad-soft p-3 text-sm text-bad">
          This account has no access (it may be disabled). Contact the administrator.
        </p>
      )}
      <div className="card mt-6 p-5">
        <LoginForm />
      </div>
    </main>
  );
}
