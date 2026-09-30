'use client';

import { useParams } from 'next/navigation';
import PropertyEditPage from '@/components/property/PropertyEditPage';

export default function EditPropertyRoute() {
  const params = useParams<{ id: string }>();
  return <PropertyEditPage propertyId={String(params?.id || '')} />;
}
