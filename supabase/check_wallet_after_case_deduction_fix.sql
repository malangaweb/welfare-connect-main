-- Post-migration wallet verification for:
-- 20260427123000_fix_contribution_wallet_effect_regression.sql

-- 1) Members likely affected by prior over-crediting of `contribution` rows.
-- `previous_formula_contribution_credit` estimates how much old formula could have inflated wallet.
WITH per_member AS (
  SELECT
    t.member_id,
    COALESCE(SUM(
      CASE
        WHEN COALESCE(t.status, 'completed') = 'completed'
         AND t.transaction_type = 'contribution'
        THEN COALESCE(t.amount, 0)
        ELSE 0
      END
    ), 0) AS previous_formula_contribution_credit
  FROM public.transactions t
  WHERE t.member_id IS NOT NULL
  GROUP BY t.member_id
)
SELECT
  m.id AS member_id,
  m.member_number,
  m.name,
  pm.previous_formula_contribution_credit::NUMERIC(15,2) AS previous_formula_contribution_credit,
  m.wallet_balance::NUMERIC(15,2) AS stored_wallet_balance,
  calculate_wallet_balance(m.id)::NUMERIC(15,2) AS computed_wallet_balance,
  (m.wallet_balance - calculate_wallet_balance(m.id))::NUMERIC(15,2) AS drift
FROM public.members m
JOIN per_member pm ON pm.member_id = m.id
WHERE ABS(pm.previous_formula_contribution_credit) > 0.01
ORDER BY ABS(pm.previous_formula_contribution_credit) DESC, m.member_number;

-- 2) Global drift check (stored vs computed).
SELECT
  d.member_id,
  d.member_number,
  d.name,
  d.stored_wallet_balance,
  d.computed_wallet_balance,
  d.drift
FROM public.member_wallet_balance_drift d
WHERE ABS(d.drift) > 0.01
ORDER BY ABS(d.drift) DESC, d.member_number;

-- 3) Drift summary.
SELECT
  COUNT(*) FILTER (WHERE ABS(drift) > 0.01) AS members_with_drift,
  COALESCE(SUM(ABS(drift)) FILTER (WHERE ABS(drift) > 0.01), 0)::NUMERIC(15,2) AS total_absolute_drift
FROM public.member_wallet_balance_drift;
