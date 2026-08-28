export interface Property {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  estimated_value: number;
  mortgage_balance: number;
  property_type: string;
}

export interface Unit {
  id: string;
  property_id: string;
  unit_number: string;
  bedroom_count: number;
  bathroom_count: number;
  sqft: number;
  current_rent: number;
  tenant_name: string;
  occupied: boolean;
}

export interface Transaction {
  id: string;
  property_id: string;
  transaction_date: string;
  type: 'income' | 'expense' | 'transfer';
  category: string;
  description: string;
  payee_source: string | null;
  amount: number;
  notes: string | null;
}
