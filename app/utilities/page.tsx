import { redirect } from 'next/navigation';

export default function UtilitiesPage() {
  redirect('/account?section=utilities');
}
