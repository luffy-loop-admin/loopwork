'use client';
import ActionForm from '@/components/ActionForm';
import { login } from '@/app/actions/auth';

export default function LoginForm() {
  return (
    <ActionForm action={login} submitLabel="Sign in" submitClassName="btn btn-primary w-full">
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required autoComplete="email" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required autoComplete="current-password" className="input" />
        </div>
      </div>
    </ActionForm>
  );
}
