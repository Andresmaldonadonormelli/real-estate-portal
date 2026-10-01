'use client';

export default function PortfolioIdentity() {
  const asOf = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return <header className="portfolio-identity">
    <strong>Your Portfolio</strong>
    <p>As of {asOf}</p>
  </header>;
}
