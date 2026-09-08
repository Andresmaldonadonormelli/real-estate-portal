# RE Portal V2 Quick Start

1. In Supabase, open SQL Editor and run `SUPABASE_V2_UPDATE.sql` once.
2. Replace the files in GitHub with the contents of this folder.
3. Commit the update to your production branch.
4. Let Vercel build the new commit.
5. Log in and test Properties first.

## Test checklist
- Edit a property and set Monthly mortgage payment + Management fee %.
- Edit each occupied unit and confirm Monthly rent + Create pending rent each month.
- Open Dashboard. Pending rent suggestions appear for occupied units without a posted rent for the current month.
- Confirm a rent. It becomes posted and automatically creates the property's management-fee expense.
- Mortgage posts automatically for the current month when the portal is opened after the month begins.
- Import the Doorvest CSV from Ledger & Docs > Ledger > Import CSV.
- Test Documents and Utilities.

Recurring items are duplicate-protected. Existing/imported rent for a unit in the current month prevents a duplicate pending rent suggestion.
