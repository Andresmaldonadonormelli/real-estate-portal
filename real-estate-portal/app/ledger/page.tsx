'use client';

import { useState, useMemo } from 'react';
import { mockTransactions } from '@/lib/mockData';
import { groupTransactionsByMonth, calculateMonthlyTotals } from '@/lib/calculations';
import { formatCurrency, formatDateShort, formatMonthYear } from '@/lib/formatters';
import type { Transaction } from '@/lib/types';

type ViewMode = 'months' | 'table';
type TabType = 'ledger' | 'statements' | 'documents';

interface LedgerFilters {
  searchText: string;
  typeFilter: '' | 'income' | 'expense' | 'transfer';
  categoryFilter: string;
  minAmount: string;
  maxAmount: string;
}

export default function LedgerPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('months');
  const [activeTab, setActiveTab] = useState<TabType>('ledger');
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set(['2026-08']));
  const [filters, setFilters] = useState<LedgerFilters>({
    searchText: '',
    typeFilter: '',
    categoryFilter: '',
    minAmount: '',
    maxAmount: '',
  });

  const filteredTransactions = useMemo(() => {
    return mockTransactions.filter((tx) => {
      if (filters.searchText) {
        const search = filters.searchText.toLowerCase();
        if (
          !tx.description.toLowerCase().includes(search) &&
          !tx.category.toLowerCase().includes(search) &&
          !(tx.payee_source?.toLowerCase().includes(search) ?? false)
        ) {
          return false;
        }
      }

      if (filters.typeFilter && tx.type !== filters.typeFilter) {
        return false;
      }

      if (filters.categoryFilter && tx.category !== filters.categoryFilter) {
        return false;
      }

      const absAmount = Math.abs(tx.amount);
      if (filters.minAmount && absAmount < parseFloat(filters.minAmount)) {
        return false;
      }
      if (filters.maxAmount && absAmount > parseFloat(filters.maxAmount)) {
        return false;
      }

      return true;
    });
  }, [filters]);

  const monthlyGroups = useMemo(() => {
    const grouped = groupTransactionsByMonth(filteredTransactions);
    return Object.entries(grouped)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, txs]) => ({
        key,
        year: parseInt(key.split('-')[0]),
        month: parseInt(key.split('-')[1]),
        transactions: txs.sort(
          (a, b) =>
            new Date(b.transaction_date).getTime() -
            new Date(a.transaction_date).getTime()
        ),
      }));
  }, [filteredTransactions]);

  const toggleMonth = (key: string) => {
    const newExpanded = new Set(expandedMonths);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedMonths(newExpanded);
  };

  const handleExport = () => {
    const csv = [
      ['Date', 'Description', 'Category', 'Payee', 'Type', 'Amount'].join(','),
      ...filteredTransactions.map((tx) =>
        [
          tx.transaction_date,
          tx.description,
          tx.category,
          tx.payee_source || '',
          tx.type,
          tx.amount,
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ledger-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '28px', marginBottom: '24px', fontWeight: 500 }}>Ledger & Docs</h1>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '24px',
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        {(['ledger', 'statements', 'documents'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '12px 16px',
              fontSize: '14px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid var(--accent)' : 'none',
              color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-secondary)',
              cursor: 'pointer',
              textTransform: 'capitalize',
              fontWeight: activeTab === tab ? 500 : 400,
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'ledger' && (
        <>
          {/* Controls */}
          <div
            style={{
              display: 'flex',
              gap: '12px',
              marginBottom: '24px',
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setViewMode('months')}
                style={{
                  padding: '8px 12px',
                  background: viewMode === 'months' ? 'var(--accent)' : 'var(--bg-secondary)',
                  color: viewMode === 'months' ? '#fff' : 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius)',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 500,
                }}
              >
                Months
              </button>
              <button
                onClick={() => setViewMode('table')}
                style={{
                  padding: '8px 12px',
                  background: viewMode === 'table' ? 'var(--accent)' : 'var(--bg-secondary)',
                  color: viewMode === 'table' ? '#fff' : 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius)',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 500,
                }}
              >
                Table
              </button>
            </div>

            <button
              onClick={handleExport}
              style={{
                padding: '8px 12px',
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius)',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 500,
              }}
            >
              📥 Export
            </button>

            <input
              type="text"
              placeholder="Search..."
              value={filters.searchText}
              onChange={(e) => setFilters({ ...filters, searchText: e.target.value })}
              style={{
                flex: 1,
                minWidth: '200px',
                padding: '8px 12px',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '14px',
              }}
            />
          </div>

          {/* Filters */}
          <div
            style={{
              marginBottom: '24px',
              padding: '16px',
              background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius)',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: '12px',
            }}
          >
            <select
              value={filters.typeFilter}
              onChange={(e) => setFilters({ ...filters, typeFilter: e.target.value as any })}
              style={{
                padding: '8px 12px',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '14px',
              }}
            >
              <option value="">All Types</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
              <option value="transfer">Transfer</option>
            </select>

            <select
              value={filters.categoryFilter}
              onChange={(e) => setFilters({ ...filters, categoryFilter: e.target.value })}
              style={{
                padding: '8px 12px',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '14px',
              }}
            >
              <option value="">All Categories</option>
              <option value="Rent">Rent</option>
              <option value="Management Fee">Management Fee</option>
              <option value="Other">Other</option>
            </select>

            <input
              type="number"
              placeholder="Min Amount"
              value={filters.minAmount}
              onChange={(e) => setFilters({ ...filters, minAmount: e.target.value })}
              style={{
                padding: '8px 12px',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '14px',
              }}
            />

            <input
              type="number"
              placeholder="Max Amount"
              value={filters.maxAmount}
              onChange={(e) => setFilters({ ...filters, maxAmount: e.target.value })}
              style={{
                padding: '8px 12px',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '14px',
              }}
            />

            <button
              onClick={() =>
                setFilters({
                  searchText: '',
                  typeFilter: '',
                  categoryFilter: '',
                  minAmount: '',
                  maxAmount: '',
                })
              }
              style={{
                padding: '8px 12px',
                background: 'var(--bg-primary)',
                color: 'var(--accent)',
                border: '1px solid var(--accent)',
                borderRadius: 'var(--radius)',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 500,
              }}
            >
              Clear
            </button>
          </div>

          {/* Content */}
          {viewMode === 'months' ? (
            <MonthlyView monthlyGroups={monthlyGroups} expandedMonths={expandedMonths} toggleMonth={toggleMonth} />
          ) : (
            <TableView transactions={filteredTransactions} />
          )}
        </>
      )}

      {activeTab === 'statements' && (
        <div className="card">
          <p style={{ color: 'var(--text-secondary)' }}>Statements feature coming soon</p>
        </div>
      )}

      {activeTab === 'documents' && (
        <div className="card">
          <p style={{ color: 'var(--text-secondary)' }}>Documents feature coming soon</p>
        </div>
      )}
    </div>
  );
}

function MonthlyView({
  monthlyGroups,
  expandedMonths,
  toggleMonth,
}: {
  monthlyGroups: any[];
  expandedMonths: Set<string>;
  toggleMonth: (key: string) => void;
}) {
  return (
    <div style={{ display: 'grid', gap: '12px' }}>
      {monthlyGroups.map((group) => {
        const totals = calculateMonthlyTotals(group.transactions);
        const isExpanded = expandedMonths.has(group.key);

        return (
          <div key={group.key} className="card">
            <button
              onClick={() => toggleMonth(group.key)}
              style={{
                width: '100%',
                textAlign: 'left',
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: isExpanded ? '16px' : 0,
              }}
            >
              <div>
                <h3 style={{ fontSize: '16px', marginBottom: '8px', fontWeight: 500 }}>
                  {formatMonthYear(group.year, group.month)}
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {group.transactions.length} transactions
                </p>
              </div>
              <div
                style={{
                  textAlign: 'right',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                }}
              >
                <div style={{ fontSize: '12px' }}>
                  <div style={{ color: 'var(--text-secondary)' }}>Net</div>
                  <div
                    style={{
                      fontSize: '16px',
                      fontWeight: 500,
                      color: totals.net > 0 ? 'var(--accent)' : 'var(--danger)',
                    }}
                  >
                    {formatCurrency(totals.net)}
                  </div>
                </div>
                <span
                  style={{
                    transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s',
                  }}
                >
                  ⌄
                </span>
              </div>
            </button>

            {isExpanded && (
              <>
                {/* Summary Bar */}
                <div
                  style={{
                    marginBottom: '16px',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '12px',
                    fontSize: '13px',
                  }}
                >
                  <div>
                    <span style={{ color: 'var(--text-secondary)' }}>Income</span>
                    <div style={{ color: 'var(--accent)', fontWeight: 500 }}>
                      {formatCurrency(totals.income)}
                    </div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)' }}>Expenses</span>
                    <div style={{ color: 'var(--danger)', fontWeight: 500 }}>
                      {formatCurrency(totals.expense)}
                    </div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)' }}>Ratio</span>
                    <div
                      style={{
                        width: '100%',
                        height: '8px',
                        background: 'var(--bg-primary)',
                        borderRadius: '4px',
                        overflow: 'hidden',
                        marginTop: '4px',
                        display: 'flex',
                      }}
                    >
                      <div
                        style={{
                          flex: totals.income,
                          background: 'var(--accent)',
                          height: '100%',
                        }}
                      />
                      <div
                        style={{
                          flex: totals.expense,
                          background: 'var(--danger)',
                          height: '100%',
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Transactions */}
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                  {group.transactions.map((tx: Transaction) => (
                    <div
                      key={tx.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr auto',
                        gap: '12px',
                        padding: '12px 0',
                        borderBottom: '1px solid var(--border-color)',
                        fontSize: '13px',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 500 }}>
                          {formatDateShort(tx.transaction_date)}
                        </div>
                        <div style={{ color: 'var(--text-secondary)' }}>
                          {tx.description}
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                          {tx.payee_source || tx.category}
                        </div>
                      </div>
                      <div>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '4px 8px',
                            background: 'var(--bg-primary)',
                            borderRadius: '4px',
                            fontSize: '11px',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {tx.category}
                        </span>
                      </div>
                      <div
                        style={{
                          fontWeight: 500,
                          textAlign: 'right',
                          minWidth: '80px',
                          color:
                            tx.type === 'income'
                              ? 'var(--accent)'
                              : tx.type === 'expense'
                              ? 'var(--danger)'
                              : 'var(--text-secondary)',
                        }}
                      >
                        {tx.type === 'expense' && '-'}
                        {formatCurrency(Math.abs(tx.amount))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TableView({ transactions }: { transactions: Transaction[] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ fontSize: '13px' }}>
        <thead>
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th>Category</th>
            <th>Payee</th>
            <th style={{ textAlign: 'right' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => (
            <tr key={tx.id}>
              <td>{tx.transaction_date}</td>
              <td>{tx.description}</td>
              <td>{tx.category}</td>
              <td>{tx.payee_source || '—'}</td>
              <td
                style={{
                  textAlign: 'right',
                  color:
                    tx.type === 'income'
                      ? 'var(--accent)'
                      : tx.type === 'expense'
                      ? 'var(--danger)'
                      : 'var(--text-secondary)',
                }}
              >
                {tx.type === 'expense' && '-'}
                {formatCurrency(Math.abs(tx.amount))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
