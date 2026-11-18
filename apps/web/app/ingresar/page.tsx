import { Suspense } from 'react';
import type { Metadata } from 'next';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Ingresar' };

export default function LoginPage() {
  return (
    <main className="ruled grid min-h-dvh place-items-center px-4 py-10" style={{ paddingLeft: 'max(16px, env(safe-area-inset-left))', paddingRight: 'max(16px, env(safe-area-inset-right))' }}>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
