import { redirect } from 'next/navigation';

/** "Mi usuario" ahora es un modal: los enlaces antiguos a /cuenta lo abren sobre la agenda. */
export default function AccountPage() {
  redirect('/agenda?cuenta=1');
}
