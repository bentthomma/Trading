"""Exact, deliberately narrow MPR1 cash oracle, not a product ledger or strategy.

The entry has already been admitted by the MP05 quote/clock contract. This module
only calculates the MP06 money identities. It has no price feed or order sender.
Fractions avoid premature cent rounding; finite decimal output is exact.
"""
from __future__ import annotations
from fractions import Fraction
from pathlib import Path
import importlib.util
import json

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('s02_domain', ROOT/'adapters/contracts/v1/domain.py')
domain = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(domain)

FIELDS = {'case_id','currency','quantity_unit','multiplier','initial_cash','risk_budget',
          'entry','normal_stop_fill','mark_bid','exit_fill','fee_per_piece_per_side',
          'piece_step','price_tick','fixed_quantity'}

class ReferenceError(ValueError):
    pass

def need(ok: bool, code: str) -> None:
    if not ok:
        raise ReferenceError(code)

def number(text: str) -> Fraction:
    return domain.number(text)

def decimal(value: Fraction) -> str:
    """Lossless non-exponent decimal; never round a recurring rational."""
    n, d = value.numerator, value.denominator
    twos = fives = 0
    while d % 2 == 0:
        d //= 2; twos += 1
    while d % 5 == 0:
        d //= 5; fives += 1
    need(d == 1, 'NON_TERMINATING_DECIMAL')
    scale = max(twos, fives)
    integer = abs(n) * (2 ** (scale-twos)) * (5 ** (scale-fives))
    s = str(integer).rjust(scale+1, '0')
    if scale:
        s = (s[:-scale]+'.'+s[-scale:]).rstrip('0').rstrip('.')
    return ('-' if n < 0 else '') + s

def evaluate(case: dict) -> dict:
    need(isinstance(case, dict) and set(case) == FIELDS, 'UNKNOWN_OR_MISSING_CASE_FIELD')
    need(isinstance(case['case_id'], str) and 0 < len(case['case_id']) <= 100, 'CASE_ID')
    need(case['currency'] == 'CHF' and case['quantity_unit'] == 'pieces', 'MPR1_UNITS_REQUIRED')
    need(case['multiplier'] == '1' and case['piece_step'] == '1' and case['price_tick'] == '0.01', 'MPR1_INSTRUMENT_REQUIRED')
    numeric = ['initial_cash','risk_budget','entry','normal_stop_fill','mark_bid','exit_fill','fee_per_piece_per_side']
    v = {k: number(case[k]) for k in numeric}
    need(v['initial_cash'] >= 0 and v['risk_budget'] >= 0, 'NEGATIVE_CASH_OR_BUDGET')
    need(v['fee_per_piece_per_side'] >= 0, 'NEGATIVE_FEE_NOT_MPR1')
    for k in ['entry','normal_stop_fill','mark_bid','exit_fill']:
        need(v[k] > 0 and (v[k]/Fraction('0.01')).denominator == 1, 'INVALID_MPR1_PRICE_GRID')
    cash,budget,entry,stop,mark,exit,fee = (v[k] for k in numeric)
    need(entry > stop, 'STOP_NOT_BELOW_ENTRY')
    unit_risk = entry - stop + 2*fee
    risk_qty = budget // unit_risk
    cash_qty = cash // (entry+fee)
    sized = min(risk_qty,cash_qty)
    fixed = case['fixed_quantity']
    if fixed is None:
        quantity = sized
        sizing = 'pre_entry_minimum_of_risk_and_cash'
    else:
        q = number(fixed)
        need(q >= 0 and q.denominator == 1, 'WHOLE_PIECES_REQUIRED')
        quantity = int(q)
        need(quantity*(entry+fee) <= cash, 'FIXED_SCENARIO_UNFUNDED')
        sizing = 'frozen_quantity_cost_stress_not_new_entry_permission'
    q = Fraction(quantity)
    entry_value=q*entry; entry_fee=q*fee; after=cash-entry_value-entry_fee
    mark_value=q*mark; mark_equity=after+mark_value
    gross=q*(exit-entry); exit_fee=q*fee; net=gross-entry_fee-exit_fee
    ending=after+q*exit-exit_fee
    need(ending == cash+net, 'CASH_IDENTITY_BROKEN')
    need(mark_equity == cash+q*(mark-entry)-entry_fee, 'MARK_IDENTITY_BROKEN')
    out = {
        'case_id':case['case_id'], 'currency':'CHF','quantity_unit':'pieces',
        'sizing_mode':sizing,'q_risk':str(risk_qty),'q_cash':str(cash_qty),'quantity':str(quantity),
        'normal_loss_per_piece':decimal(unit_risk),
        'entry_notional':decimal(entry_value),'entry_fee':decimal(entry_fee),
        'cash_after_entry':decimal(after),'mark_bid_value':decimal(mark_value),
        'mark_equity':decimal(mark_equity),'gross_pnl':decimal(gross),'exit_fee':decimal(exit_fee),
        'total_explicit_fees':decimal(entry_fee+exit_fee),'net_pnl':decimal(net),'ending_cash':decimal(ending),
        'normal_loss_for_quantity':decimal(q*unit_risk),'normal_budget_residual':decimal(budget-q*unit_risk),
        'normal_budget_exceeded':q*unit_risk > budget,
        'actual_scenario_loss_exceeds_budget':net < -budget,
        'spread_slippage_deducted_again':False,
        'entry_permitted_by_this_calculator':False,
    }
    return out

def scenarios() -> list[dict]:
    base={'case_id':'normal_stop','currency':'CHF','quantity_unit':'pieces','multiplier':'1',
          'initial_cash':'10000','risk_budget':'25','entry':'100.25','normal_stop_fill':'99.58',
          'mark_bid':'100.22','exit_fill':'99.58','fee_per_piece_per_side':'0.005',
          'piece_step':'1','price_tick':'0.01','fixed_quantity':None}
    return [base,dict(base,case_id='target',exit_fill='101.54'),dict(base,case_id='gap',exit_fill='99.08'),
            dict(base,case_id='insufficient_cash',initial_cash='12',risk_budget='0.03'),
            dict(base,case_id='higher_known_fees',fee_per_piece_per_side='0.015'),
            dict(base,case_id='higher_fees_frozen_36',fee_per_piece_per_side='0.015',fixed_quantity='36')]

def build_golden() -> dict:
    return {'schema_version':'extremelab.s05.mpr1-golden/1.0.0',
            'status':'offline_reference_not_product_acceptance',
            'source':'MP05-MP06/MPW06; workbook pages 21-27; archived MPG05.json',
            'cases':[{'input':x,'expected':evaluate(x)} for x in scenarios()],
            'paths_are_alternatives_not_a_time_series':True,
            'not_implemented_here':['signal_detection','quote_admission','broker_dispatch','account_wide_cash_ledger',
                                    'FX_conversion','dividends','swap','short_sales','native_restart']}

if __name__ == '__main__':
    print(json.dumps(build_golden(),ensure_ascii=False,indent=2))
