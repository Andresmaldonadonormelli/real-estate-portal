import type { Metadata } from 'next';
import LabFrame from './lab-frame';
import './ui-lab.css';

export const metadata: Metadata = { title: 'UI Lab · AM Properties' };

export default function UiLabLayout({ children }: { children: React.ReactNode }) {
  return <LabFrame>{children}</LabFrame>;
}
