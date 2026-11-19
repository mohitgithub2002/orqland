// [HOST SHIM] Harness landing — do not copy.
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/orders');
}
