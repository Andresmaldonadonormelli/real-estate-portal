export interface Property {
  id: string;
  user_id?: string | null;
  address: string;
  city: string;
  state: string;
  zip: string;
  mortgage_balance: number;
  property_type: string;
  purchase_price?: number | null;
  purchase_date?: string | null;
  monthly_mortgage_payment?: number | null;
  management_fee_percent?: number | null;
}

export interface Unit {
  id: string;
  user_id?: string | null;
  property_id: string;
  unit_number: string;
  bedroom_count: number;
  bathroom_count: number;
  sqft: number;
  current_rent: number;
  tenant_name: string;
  occupied: boolean;
  recurring_rent_enabled?: boolean;
}

export interface Transaction {
  id: string;
  user_id?: string | null;
  property_id: string;
  unit_id?: string | null;
  transaction_date: string;
  type: 'income' | 'expense' | 'transfer';
  category: string;
  description: string;
  payee_source: string | null;
  amount: number;
  notes: string | null;
  import_key?: string | null;
  source?: string | null;
  status?: 'pending' | 'posted';
  confirmed_at?: string | null;
}

export interface PropertyDocument {
  id: string;
  user_id?: string | null;
  property_id: string;
  unit_id?: string | null;
  category: string;
  title: string;
  file_name: string;
  storage_path: string;
  mime_type?: string | null;
  file_size?: number | null;
  document_date?: string | null;
  notes?: string | null;
  created_at?: string;
}

export interface UtilityAccount {
  id: string;
  user_id?: string | null;
  property_id: string;
  utility_type: string;
  provider: string;
  account_number?: string | null;
  username_email?: string | null;
  login_url?: string | null;
  autopay: boolean;
  responsibility: 'Owner' | 'Tenant' | 'Shared';
  billing_cycle?: string | null;
  password_reference?: string | null;
  notes?: string | null;
  created_at?: string;
}
