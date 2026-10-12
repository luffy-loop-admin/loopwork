'use server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { str } from '@/lib/form';
import type { ActionResult } from '@/lib/types';

export async function login(formData: FormData): Promise<ActionResult> {
  const email = str(formData, 'email').toLowerCase();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return { ok: false, message: 'Enter your email and password.' };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, message: 'Wrong email or password.' };
  redirect('/');
}

export async function logout(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
