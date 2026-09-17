# Jarvis Integration Guide: Personal Financial Advisor (PFA) API

This document is the complete reference manual for integrating **Jarvis** (your personal AI agent) with the **Personal Financial Advisor (PFA)** system. It covers authentication, communication protocols, ready-to-use function calling / tool definitions, and an exhaustive reference of all exposed REST endpoints.

---

## 1. System Overview & Architecture

- **Base URL**: 
  - **Production (Live)**: `https://movenorth.vercel.app`
  - **Local Development**: `http://localhost:3000`
- **Data Exchange**: All endpoints accept and return `application/json` (except `GET /api/export-context` which returns a structured markdown document inside a JSON wrapper).
- **Date Format**: Standard ISO 8601 (`YYYY-MM-DD` or `YYYY-MM-DDTHH:mm:ss.sssZ`).
- **Currency**: Indian Rupee (`INR`), numerical amounts as floats/integers.
- **Tenancy**: Single-tenant personal finance advisor for owner (Sushant Wayal). All endpoints operate directly on the user's primary profile and linked accounts.

---

## 2. Authentication & Security for Jarvis

### Current Security Architecture
1. **Next.js Web UI**:
   - Uses an encrypted JWT cookie named `auth_session` created with `AUTH_SECRET` (HS256).
   - Login password is validated against `ADMIN_PASSWORD` defined in `.env`.
2. **Public Next.js API Routes (`/api/*`)**:
   - `middleware.ts` explicitly bypasses all paths starting with `/api` from web cookie enforcement:
     ```typescript
     if (path.startsWith('/_next') || path.startsWith('/api') || path.startsWith('/public')) {
       return NextResponse.next();
     }
     ```
   - **What this means for Jarvis**: Jarvis can call all standard `/api/*` endpoints directly over HTTP (e.g. `http://localhost:3000/api/...`) without requiring a cookie when running locally or on a protected private network!
3. **Protected Cron Endpoints (`/api/cron/*`)**:
   - Automated valuation and daily interest accrual endpoints require a Bearer token:
     ```http
     Authorization: Bearer <CRON_SECRET>
     ```
     *(If `CRON_SECRET` is unset in `.env`, the value is checked against `Bearer undefined`)*.

---

### Integration Patterns for Jarvis

#### Pattern A: Direct REST Calls (Local / Private LAN) — Recommended & Ready Now
Jarvis makes standard HTTP JSON requests:
```bash
curl -X GET http://localhost:3000/api/dashboard/overview \
  -H "Content-Type: application/json"
```

#### Pattern B: Python Client Helper for Jarvis
Below is a lightweight Python client Jarvis can import to interact with PFA:

```python
import os
import requests
from typing import Any, Dict, Optional

class PFAClient:
    def __init__(self, base_url: Optional[str] = None):
        self.base_url = (base_url or os.getenv("PFA_BASE_URL", "https://movenorth.vercel.app")).rstrip("/")
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "Accept": "application/json"
        })

    def get(self, endpoint: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        url = f"{self.base_url}{endpoint}"
        resp = self.session.get(url, params=params, timeout=15)
        resp.raise_for_status()
        return resp.json()

    def post(self, endpoint: str, json_data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        url = f"{self.base_url}{endpoint}"
        resp = self.session.post(url, json=json_data, timeout=30)
        resp.raise_for_status()
        return resp.json()

    def patch(self, endpoint: str, json_data: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.base_url}{endpoint}"
        resp = self.session.patch(url, json=json_data, timeout=15)
        resp.raise_for_status()
        return resp.json()

    def delete(self, endpoint: str, json_data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        url = f"{self.base_url}{endpoint}"
        resp = self.session.delete(url, json=json_data, timeout=15)
        resp.raise_for_status()
        return resp.json()
```

---

## 3. High-Value "Super Tools" for Jarvis

Before diving into granular CRUD endpoints, two endpoints provide disproportionate value for an AI agent:

### 1. `GET /api/export-context` (The Complete Financial Snapshot)
Instead of Jarvis making 10 individual queries to understand the user's situation, a single call to `/api/export-context` returns a structured Markdown document containing:
- Current profile, liquid balance, monthly income, expenses, and savings rate.
- Net worth breakdown across 16 asset/liability categories.
- Recent 90-day transactions summary.
- Goals status, deadlines, and monthly ETA recommendations.
- Active subscriptions and monthly recurring burn.
- Budget status per category.
- Investment suggestion and emergency fund status.
- AI memories and preferences.

**Response Structure:**
```json
{
  "ok": true,
  "filename": "financial-context-2026-09-17.md",
  "content": "# Personal Financial Context — User\n..."
}
```

### 2. `POST /api/ai/advisor` (Delegate to Embedded Advisor)
PFA has a built-in agentic loop powered by Gemini with access to internal database aggregators. Jarvis can delegate complex multi-step financial questions directly to PFA:
```json
// Request Body
{
  "question": "Can I afford to buy a new laptop for 85,000 INR next month?",
  "history": []
}
```

---

## 4. Complete Catalog of Exposed API Endpoints

---

### Group 1: Dashboard & Overview

#### `GET /api/dashboard/overview`
Returns high-level financial summary, metrics, and health scores.
- **Query Params**: None
- **Response**:
  ```json
  {
    "ok": true,
    "data": {
      "networthSummary": {
        "totals": {
          "assets": 1250000.0,
          "liabilities": 150000.0,
          "networth": 1100000.0
        }
      },
      "financialHealthScore": {
        "score": 85,
        "status": "HEALTHY",
        "breakdown": { "savingsRate": 25, "runwayMonths": 9.4, "efCoverage": 6 }
      },
      "metrics": {
        "balance": 185000.0,
        "burnRate": 45000.0,
        "runwayMonths": 4.1,
        "emergencyFund": { "saved": 150000, "target": 270000, "progressPct": 55.5 },
        "savingsRate": 28.5,
        "monthlyIncome": 120000.0,
        "monthlyExpenses": 45000.0
      },
      "budgets": [],
      "insights": []
    }
  }
  ```

---

### Group 2: Transactions

#### `GET /api/transactions/list`
Fetch paginated and filtered transactions with category lists.
- **Query Parameters**:
  - `page` (number, default: `1`): Page number
  - `pageSize` (number, default: `50`): Items per page
  - `search` (string): Text search across merchant and notes
  - `category` (string): Filter by category name
  - `type` (string): `"income"` | `"expense"`
  - `dateRange` (string): `"today"` | `"last7"` | `"last30"` | `"last90"` | `"this_month"` | `"last_month"` | `"all"`
  - `dateFrom` (string): `"YYYY-MM-DD"`
  - `dateTo` (string): `"YYYY-MM-DD"`
  - `amountMin` (number): Minimum amount
  - `amountMax` (number): Maximum amount
  - `merchant` (string): Exact or partial merchant name
  - `sort` (string): e.g. `date:desc`, `amount:asc`, `merchant:asc`
- **Response**:
  ```json
  {
    "data": [
      {
        "id": "cuid123",
        "amount": 1450.0,
        "merchant": "Swiggy",
        "type": "DEBIT",
        "transactionType": "EXPENSE",
        "timestamp": "2026-09-15T14:30:00.000Z",
        "category": { "id": "cat_1", "name": "Food & Dining" },
        "notes": "Dinner with friends"
      }
    ],
    "total": 142,
    "page": 1,
    "pageSize": 50,
    "totalPages": 3,
    "categories": ["Food & Dining", "Groceries", "Shopping", "Salary", "Investment"]
  }
  ```

#### `POST /api/transactions`
Ingest or record a new transaction.
- **Request Body**:
  ```json
  {
    "amount": 2500,
    "merchant": "Amazon India",
    "type": "DEBIT",
    "transactionType": "EXPENSE",
    "category": "Shopping",
    "notes": "Ergonomic mouse",
    "paymentMethod": "UPI",
    "bankName": "HDFC Bank",
    "timestamp": "2026-09-17T12:00:00Z"
  }
  ```
- **Response**:
  ```json
  {
    "ok": true,
    "transaction": {
      "id": "cm12345",
      "amount": 2500,
      "merchant": "Amazon India",
      "categoryId": "cat_shopping",
      "type": "DEBIT"
    }
  }
  ```

#### `PATCH /api/transactions/[id]`
Update an existing transaction.
- **URL Parameter**: `id` (Transaction CUID)
- **Request Body**:
  ```json
  {
    "merchant": "Amazon",
    "amount": 2300,
    "category": "Electronics",
    "notes": "Price adjusted after coupon",
    "transactionType": "EXPENSE",
    "paymentMethod": "Credit Card"
  }
  ```
- **Response**:
  ```json
  { "ok": true, "transaction": { "id": "cm12345", "amount": 2300 } }
  ```

#### `DELETE /api/transactions/[id]`
Delete a transaction and automatically restore account balance impact.
- **URL Parameter**: `id` (Transaction CUID)
- **Response**: `{ "ok": true }`

#### `GET /api/transactions/options`
Fetch distinct values (merchants, payment methods, accounts) for autofill/filter options.
- **Response**: `{ "merchants": [...], "paymentMethods": [...], "accounts": [...] }`

#### `POST /api/transactions/bulk`
Bulk import multiple transactions at once.
- **Request Body**: `{ "transactions": [ { "amount": 100, "merchant": "..." }, ... ] }`

#### `POST /api/transactions/club` & `POST /api/transactions/club/[id]/separate`
Club multiple micro-transactions into one aggregate or separate them back.

---

### Group 3: Financial Goals

#### `GET /api/goals`
List all configured financial goals with progress.
- **Response**:
  ```json
  {
    "ok": true,
    "goals": [
      {
        "id": "goal_1",
        "title": "Emergency Fund",
        "targetAmount": 300000,
        "currentAmount": 150000,
        "monthlyTarget": 25000,
        "targetDate": "2026-12-31T00:00:00.000Z",
        "priority": 1,
        "status": "ACTIVE",
        "notes": "6 months living expenses"
      }
    ]
  }
  ```

#### `POST /api/goals`
Create a new financial goal.
- **Request Body**:
  ```json
  {
    "title": "Japan Trip",
    "targetAmount": 200000,
    "targetDate": "2027-04-15",
    "priority": 2,
    "initialAllocation": 10000,
    "notes": "Flights and stay"
  }
  ```
- **Response**: `{ "ok": true, "goal": { ... } }`

#### `PATCH /api/goals/[id]`
Update a goal's parameters or progress.
- **Request Body**:
  ```json
  {
    "currentAmount": 35000,
    "monthlyTarget": 15000,
    "priority": 2,
    "targetDate": "2027-05-01"
  }
  ```
- **Response**: `{ "ok": true, "goal": { ... } }`

#### `DELETE /api/goals/[id]`
Delete a financial goal.
- **Response**: `{ "ok": true }`

#### `POST /api/goals/what-if`
Simulate what-if scenarios (e.g. changing monthly contribution or timeline).
- **Request Body**:
  ```json
  {
    "goalId": "goal_1",
    "additionalMonthlyContribution": 5000
  }
  ```
- **Response**: Detailed simulation metrics and new projected completion date.

#### `POST /api/goals/recommend`
AI-driven recommendations for goal timelines and funding allocations based on cashflow.

---

### Group 4: Budgets & Categories

#### `GET /api/budgets`
Get all category budgets with spent vs limit progress.
- **Response**:
  ```json
  {
    "ok": true,
    "budgets": [
      {
        "id": "b_1",
        "categoryId": "cat_food",
        "monthlyLimit": 15000,
        "spent": 8420,
        "available": 6580,
        "rollover": false,
        "category": { "id": "cat_food", "name": "Food & Dining" }
      }
    ],
    "categories": [{ "id": "cat_food", "name": "Food & Dining" }]
  }
  ```

#### `POST /api/budgets`
Create or assign a monthly budget limit to a category.
- **Request Body**:
  ```json
  {
    "categoryId": "cat_food",
    "monthlyLimit": 15000,
    "rollover": false
  }
  ```

#### `DELETE /api/budgets/[id]`
Delete a category budget limit.

#### `GET /api/categories`
List all category entities in the database.

---

### Group 5: Net Worth, Assets & Liabilities

The PFA system supports 16 distinct asset and liability types:
- **Assets**: `ppf`, `epf`, `fd`, `rd`, `mutualFund`, `stock`, `vehicle`, `plot`, `independentProperty`, `apartment`, `jewellery`, `receivable`
- **Liabilities**: `loan`, `creditCard`, `bnpl`, `borrowed`

#### `GET /api/networth`
Complete breakdown of all assets and liabilities with calculated net worth.
- **Response**:
  ```json
  {
    "totals": {
      "networth": 1450000,
      "assets": 1700000,
      "liabilities": 250000
    },
    "assets": {
      "Bank Balance": [{ "bankName": "Liquid Cash", "currentWorth": 185000 }],
      "mutualFund": [{ "id": "mf_1", "schemeName": "Parag Parikh Flexi Cap", "currentWorth": 240000 }],
      "stock": [{ "id": "st_1", "symbol": "INFY", "currentWorth": 95000 }],
      "fDAccount": [...],
      "pPFAccount": [...],
      "vehicleAsset": [...]
    },
    "liabilities": {
      "loan": [{ "id": "ln_1", "loanType": "Car Loan", "outstandingBalance": 210000 }],
      "creditCard": [{ "id": "cc_1", "currentOutstanding": 40000 }]
    }
  }
  ```

#### `GET /api/networth/[type]`
Fetch all records for a specific asset/liability type (e.g. `/api/networth/mutualFund` or `/api/networth/loan`).

#### `POST /api/networth/[type]`
Add a new asset or liability record.
- **Example for `mutualFund`**:
  ```json
  {
    "schemeName": "HDFC Index Fund Nifty 50 Plan",
    "schemeCode": "119062",
    "planType": "Growth",
    "option": "Direct",
    "currentUnits": 250.45,
    "currentNav": 210.5
  }
  ```
- **Example for `loan`**:
  ```json
  {
    "loanType": "Personal",
    "outstandingBalance": 150000,
    "interestRate": 11.5,
    "interestType": "REDUCING",
    "emiAmount": 4850,
    "emiDebitDate": 5,
    "remainingEmiCount": 36
  }
  ```

#### `PATCH /api/networth/[type]/[id]` & `DELETE /api/networth/[type]/[id]`
Update or delete an asset/liability item.

---

### Group 6: Investments & Wealth Engine

#### `GET /api/investments`
Fetch current investable surplus, asset allocation buckets (Equity, Debt, Gold), cycle streak, and historical investments.
- **Response**:
  ```json
  {
    "ok": true,
    "suggestion": {
      "phase": "WEALTH_BUILDING",
      "phaseLabel": "Wealth Building Phase",
      "rawSurplus": 55000,
      "smoothedSurplus": 50000,
      "investableRate": 100,
      "totalInvestable": 50000,
      "streak": 4,
      "buckets": {
        "equity": { "pct": 70, "suggested": 35000, "final": 35000 },
        "debt": { "pct": 20, "suggested": 10000, "final": 10000 },
        "gold": { "pct": 10, "suggested": 5000, "final": 5000 }
      }
    },
    "history": [...]
  }
  ```

#### `PUT /api/investments`
Manually adjust the current cycle's asset allocation split.
- **Request Body**:
  ```json
  {
    "equity": 30000,
    "debt": 15000,
    "gold": 5000
  }
  ```

#### `POST /api/investments/invest`
Mark current cycle's investment as executed, incrementing streak and logging into `InvestmentHistory`.
- **Request Body**:
  ```json
  {
    "notes": "SIP executed via Zerodha Coin and Kuvera"
  }
  ```

---

### Group 7: Emergency Fund & Affordability

#### `GET /api/emergency-fund`
Status of emergency fund coverage, months of runway, target amount vs saved amount, and monthly allocation drip.
- **Response**:
  ```json
  {
    "ok": true,
    "efStrategy": "BALANCED",
    "targetMonths": 6,
    "targetAmount": 270000,
    "savedAmount": 180000,
    "shortfall": 90000,
    "progressPct": 66.67,
    "tier": 2,
    "efMonthlyDrip": 15000,
    "monthsToComplete": 6,
    "isComplete": false
  }
  ```

#### `POST /api/affordability/evaluate`
Instantly evaluate if a purchase is financially viable. Jarvis can call this whenever the user asks "Can I buy X for ₹Y?".
- **Request Body**:
  ```json
  {
    "price": 75000
  }
  ```
- **Response**:
  ```json
  {
    "ok": true,
    "isAffordable": true,
    "verdict": "AFFORDABLE",
    "currentBalance": 185000,
    "balanceAfterPurchase": 110000,
    "runwayBefore": 4.1,
    "runwayAfter": 2.4,
    "efImpact": "Emergency fund dipped slightly into Tier 2 coverage",
    "recommendation": "Safe to purchase if non-essential expenses are restrained this month."
  }
  ```

---

### Group 8: Subscriptions

#### `GET /api/subscriptions`
List all active recurring subscriptions.
- **Response**:
  ```json
  {
    "ok": true,
    "subscriptions": [
      {
        "id": "sub_1",
        "merchant": "Netflix",
        "amount": 649,
        "interval": "monthly",
        "nextCharge": "2026-10-02T00:00:00.000Z",
        "active": true
      }
    ]
  }
  ```

#### `POST /api/subscriptions/detect`
Trigger automatic algorithmic detection of recurring subscriptions from transaction history.

#### `PATCH /api/subscriptions` & `DELETE /api/subscriptions`
Edit or delete subscriptions.

---

### Group 9: Analytics & Spending Intelligence

| Endpoint | Method | Purpose |
| :--- | :--- | :--- |
| `/api/analytics/monthly` | `GET` | 12-month trend of income vs expenses and net savings |
| `/api/analytics/categories` | `GET` | 30-day category spend breakdown with percentages |
| `/api/analytics/category-trends` | `GET` | Category spending trends across past months |
| `/api/analytics/burn-rate` | `GET` | Average monthly cash burn rate |
| `/api/analytics/runway` | `GET` | Calculated cash runway in months based on liquid balance |
| `/api/analytics/savings-rate` | `GET` | Current savings rate percentage |
| `/api/analytics/acceleration` | `GET` | Spending and income acceleration signals |
| `/api/analytics/balance` | `GET` | Historical account balance trajectory |
| `/api/analytics/heatmap` | `GET` | Day-of-week & time-of-day spending concentration |
| `/api/analytics/risk-volatility` | `GET` | Spending volatility index |
| `/api/analytics/seasonality` | `GET` | Seasonal expense spikes |
| `/api/behavior/analyze` | `GET` | Behavioral spending anomalies and impulse signals |
| `/api/prediction/monthEnd` | `GET` | Projected month-end closing balance and expense forecast |

---

### Group 10: Financial Profile

#### `GET /api/profile`
Retrieve owner profile, liquid balance, currency, emergency fund targets, and asset class target percentages.

#### `PUT /api/profile`
Update configuration.
- **Request Body**:
  ```json
  {
    "ownerName": "Sushant",
    "currency": "INR",
    "balance": 195000,
    "emergencyFundMonths": 6,
    "efStrategy": "BALANCED",
    "stdEquityPct": 70,
    "stdDebtPct": 20,
    "stdGoldPct": 10
  }
  ```

---

### Group 11: AI Memory & Advisor

#### `GET /api/ai/memory`
Fetch persistent memories, preferences, and named AI conversations with calculated expiry metadata (`isExpired`, `expiresInDays`, `expiryLabel`).

#### `POST /api/ai/memory`
Store or update an AI conversation or preference memory. For conversations, Gemini dynamically evaluates and updates the human-readable `name` and context-aware `expiresAt` date on every update.
- **Request Body**:
  ```json
  {
    "conversationId": "chat_171892348574",
    "question": "Can I afford to save more for my emergency fund this month?",
    "response": "Based on your 30-day surplus of ₹45,000...",
    "tags": ["chat", "advisor"]
  }
  ```
  *(Or standard key/value with optional `name` and `expiresAt`)*

#### `PATCH /api/ai/memory`
Update an existing memory's name, expiry date, or value.
- **Request Body**:
  ```json
  {
    "id": "cuid_123",
    "name": "Emergency Fund Milestone Planning",
    "expiresAt": "2026-10-24T00:00:00.000Z"
  }
  ```

#### `DELETE /api/ai/memory?id=[id]`
Delete a memory or conversation.

#### `GET /api/ai/conversations`
Search, filter, and lazy-load AI conversations across the database with server-side pagination.
- **Query Parameters**:
  - `q` (optional): search query string searching across conversation `name`, `value` (transcript contents), and `key`.
  - `page` (optional): page number (default: `1`).
  - `limit` (optional): number of items per page (default: `10`, max: `50`).
- **Response**:
  ```json
  {
    "ok": true,
    "conversations": [
      {
        "id": "cuid_1",
        "key": "chat:chat_171892348574",
        "name": "Emergency Fund Strategy",
        "value": "[...]",
        "expiresAt": "2026-10-24T00:00:00.000Z",
        "isExpired": false,
        "expiresInDays": 37,
        "expiryLabel": "Expires in 37 days"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 24,
      "totalPages": 3,
      "hasMore": true
    }
  }
  ```

#### `POST /api/ai/advisor`
Execute the PFA embedded financial agentic loop.
- **Request Body**:
  ```json
  {
    "question": "What was my highest expense category this month?",
    "history": []
  }
  ```

---

### Group 12: Gmail Sync & Automation

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/gmail/status` | `GET` | Check if Gmail sync is active, connected email, last synced time |
| `/api/gmail/sync` | `POST` | Trigger an immediate scan of recent bank/UPI transaction emails |
| `/api/gmail/senders` | `GET` | List configured bank email senders (e.g. alerts@hdfcbank.net) |

---

### Group 13: Cron Valuations & Accruals

All cron endpoints require `Authorization: Bearer <CRON_SECRET>`:
- `/api/cron/conversations/cleanup` (Daily midnight purge of all expired conversations where `expiresAt <= now`)
- `/api/cron/mutual-funds/nav` (Fetches daily NAVs from AMFI/mfapi for all holdings)
- `/api/cron/stocks/price` (Fetches latest stock closing prices)
- `/api/cron/epf/daily`, `/api/cron/ppf/daily`, `/api/cron/fd/daily`, `/api/cron/rd/daily` (Daily compound interest calculations)
- `/api/cron/jewellery/daily` (Gold/Silver market rate price adjustments)
- `/api/cron/vehicles/valuation` (Depreciation adjustment)
- `/api/cron/plots/valuation`, `/api/cron/apartments/valuation`, `/api/cron/independent-property/valuation`

---

## 5. Ready-to-Use Jarvis Tool Declarations (Function Calling)

You can copy and paste the following tool definitions directly into Jarvis (OpenAI Function Calling format, Anthropic Tools format, or Gemini Tool Declarations):

### JSON Schema (OpenAI / LangChain / Gemini compatible)

```json
[
  {
    "name": "pfa_get_financial_context",
    "description": "Fetch the complete, unified financial context snapshot of the user (net worth, bank balance, burn rate, emergency fund, recent transactions, goals, subscriptions, and AI memories) as structured markdown.",
    "parameters": {
      "type": "object",
      "properties": {},
      "required": []
    }
  },
  {
    "name": "pfa_get_dashboard_overview",
    "description": "Fetch the financial health score, net worth totals, liquid balance, runway months, burn rate, and current savings rate.",
    "parameters": {
      "type": "object",
      "properties": {},
      "required": []
    }
  },
  {
    "name": "pfa_query_transactions",
    "description": "Search and filter user transactions with pagination.",
    "parameters": {
      "type": "object",
      "properties": {
        "search": { "type": "string", "description": "Search keyword in merchant or notes" },
        "category": { "type": "string", "description": "Category name (e.g. 'Food & Dining', 'Shopping')" },
        "type": { "type": "string", "enum": ["income", "expense"], "description": "Transaction type" },
        "dateRange": { "type": "string", "enum": ["today", "last7", "last30", "last90", "this_month", "last_month", "all"] },
        "amountMin": { "type": "number", "description": "Minimum transaction amount" },
        "amountMax": { "type": "number", "description": "Maximum transaction amount" },
        "page": { "type": "integer", "description": "Page number (default 1)" },
        "pageSize": { "type": "integer", "description": "Number of items (default 20)" }
      }
    }
  },
  {
    "name": "pfa_add_transaction",
    "description": "Log a new transaction (expense or income) into PFA.",
    "parameters": {
      "type": "object",
      "properties": {
        "amount": { "type": "number", "description": "Transaction amount in INR" },
        "merchant": { "type": "string", "description": "Merchant or payee name (e.g. 'Starbucks', 'Employer')" },
        "transactionType": { "type": "string", "enum": ["EXPENSE", "INCOME", "TRANSFER"], "description": "Type of transaction" },
        "category": { "type": "string", "description": "Category name (e.g. 'Groceries', 'Utilities')" },
        "paymentMethod": { "type": "string", "description": "UPI, Credit Card, Debit Card, Cash, NetBanking" },
        "notes": { "type": "string", "description": "Optional notes or details" },
        "timestamp": { "type": "string", "description": "ISO 8601 timestamp (optional, defaults to now)" }
      },
      "required": ["amount", "merchant", "transactionType"]
    }
  },
  {
    "name": "pfa_evaluate_affordability",
    "description": "Evaluate whether the user can afford a proposed purchase without jeopardizing their runway or emergency fund.",
    "parameters": {
      "type": "object",
      "properties": {
        "price": { "type": "number", "description": "Price of the planned purchase in INR" }
      },
      "required": ["price"]
    }
  },
  {
    "name": "pfa_get_goals",
    "description": "Fetch all financial goals, targets, saved amounts, deadlines, and monthly ETA recommendations.",
    "parameters": {
      "type": "object",
      "properties": {},
      "required": []
    }
  },
  {
    "name": "pfa_create_goal",
    "description": "Create a new financial savings goal.",
    "parameters": {
      "type": "object",
      "properties": {
        "title": { "type": "string", "description": "Goal title (e.g. 'Europe Vacation')" },
        "targetAmount": { "type": "number", "description": "Target amount in INR" },
        "targetDate": { "type": "string", "description": "Target completion date (YYYY-MM-DD)" },
        "priority": { "type": "integer", "description": "Priority 1 (highest) to 5 (lowest)" },
        "initialAllocation": { "type": "number", "description": "Initial amount already allocated" }
      },
      "required": ["title", "targetAmount"]
    }
  },
  {
    "name": "pfa_get_networth",
    "description": "Fetch complete net worth breakdown across bank balances, mutual funds, stocks, EPF/PPF, real estate, vehicles, and liabilities.",
    "parameters": {
      "type": "object",
      "properties": {},
      "required": []
    }
  },
  {
    "name": "pfa_get_investment_suggestion",
    "description": "Fetch current monthly investable surplus and recommended allocation across Equity, Debt, and Gold.",
    "parameters": {
      "type": "object",
      "properties": {},
      "required": []
    }
  },
  {
    "name": "pfa_record_investment",
    "description": "Record that the current cycle's investment was completed and increment the investment streak.",
    "parameters": {
      "type": "object",
      "properties": {
        "notes": { "type": "string", "description": "Optional details on where the money was invested" }
      }
    }
  },
  {
    "name": "pfa_trigger_gmail_sync",
    "description": "Trigger an immediate background scan of bank transaction emails via Gmail API.",
    "parameters": {
      "type": "object",
      "properties": {},
      "required": []
    }
  },
  {
    "name": "pfa_search_conversations",
    "description": "Search, filter, and lazy-load past AI advisor conversations with human-readable titles and expiry dates.",
    "parameters": {
      "type": "object",
      "properties": {
        "q": { "type": "string", "description": "Search keyword across conversation title, questions, or responses" },
        "page": { "type": "integer", "description": "Page number (default 1)" },
        "limit": { "type": "integer", "description": "Items per page (default 10, max 50)" }
      }
    }
  },
  {
    "name": "pfa_query_memories",
    "description": "Retrieve stored user memories, preferences, and conversations with calculated expiry metadata.",
    "parameters": {
      "type": "object",
      "properties": {},
      "required": []
    }
  },
  {
    "name": "pfa_save_memory",
    "description": "Store or update a financial memory, preference, or advisor conversation with automatic title and expiry evaluation.",
    "parameters": {
      "type": "object",
      "properties": {
        "key": { "type": "string", "description": "Unique key or identifier (optional if conversationId provided)" },
        "conversationId": { "type": "string", "description": "Conversation ID for chat threads (e.g. 'chat_171892348574')" },
        "question": { "type": "string", "description": "User question for conversation thread" },
        "response": { "type": "string", "description": "AI response content or summary" },
        "value": { "type": "string", "description": "Generic value or payload for preference memory" },
        "tags": { "type": "array", "items": { "type": "string" }, "description": "Tags associated with memory (e.g. ['chat', 'advisor'])" }
      }
    }
  }
]
```

---

## 6. Example Jarvis Python Integration Script

Here is an end-to-end Python implementation that maps Jarvis tools to the PFA REST API:

```python
import os
import json
import requests

PFA_BASE = os.getenv("PFA_BASE_URL", "https://movenorth.vercel.app")

def execute_pfa_tool(tool_name: str, arguments: dict):
    """Dispatcher for Jarvis tools interacting with Personal Financial Advisor."""
    
    if tool_name == "pfa_get_financial_context":
        res = requests.get(f"{PFA_BASE}/api/export-context")
        return res.json().get("content", "No context available")

    elif tool_name == "pfa_get_dashboard_overview":
        res = requests.get(f"{PFA_BASE}/api/dashboard/overview")
        return res.json().get("data", {})

    elif tool_name == "pfa_query_transactions":
        res = requests.get(f"{PFA_BASE}/api/transactions/list", params=arguments)
        return res.json()

    elif tool_name == "pfa_add_transaction":
        payload = {
            "amount": arguments["amount"],
            "merchant": arguments["merchant"],
            "transactionType": arguments.get("transactionType", "EXPENSE"),
            "category": arguments.get("category"),
            "notes": arguments.get("notes"),
            "paymentMethod": arguments.get("paymentMethod"),
            "timestamp": arguments.get("timestamp")
        }
        res = requests.post(f"{PFA_BASE}/api/transactions", json=payload)
        return res.json()

    elif tool_name == "pfa_evaluate_affordability":
        res = requests.post(f"{PFA_BASE}/api/affordability/evaluate", json={"price": arguments["price"]})
        return res.json()

    elif tool_name == "pfa_get_goals":
        res = requests.get(f"{PFA_BASE}/api/goals")
        return res.json().get("goals", [])

    elif tool_name == "pfa_create_goal":
        res = requests.post(f"{PFA_BASE}/api/goals", json=arguments)
        return res.json()

    elif tool_name == "pfa_get_networth":
        res = requests.get(f"{PFA_BASE}/api/networth")
        return res.json()

    elif tool_name == "pfa_get_investment_suggestion":
        res = requests.get(f"{PFA_BASE}/api/investments")
        return res.json()

    elif tool_name == "pfa_record_investment":
        res = requests.post(f"{PFA_BASE}/api/investments/invest", json={"notes": arguments.get("notes")})
        return res.json()

    elif tool_name == "pfa_trigger_gmail_sync":
        res = requests.post(f"{PFA_BASE}/api/gmail/sync")
        return res.json()

    elif tool_name == "pfa_search_conversations":
        res = requests.get(f"{PFA_BASE}/api/ai/conversations", params=arguments)
        return res.json()

    elif tool_name == "pfa_query_memories":
        res = requests.get(f"{PFA_BASE}/api/ai/memory")
        return res.json()

    elif tool_name == "pfa_save_memory":
        res = requests.post(f"{PFA_BASE}/api/ai/memory", json=arguments)
        return res.json()

    else:
        raise ValueError(f"Unknown PFA tool: {tool_name}")
```
