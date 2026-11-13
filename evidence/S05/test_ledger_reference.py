"""Cash oracle, source and compatibility tests. No live trading assumptions."""
from pathlib import Path
from fractions import Fraction
from decimal import Decimal
from dataclasses import replace
import importlib.util, json, os, subprocess, sys, unittest, zipfile
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
sys.path.insert(0,str(HERE))
if os.environ.get('S05_ORACLE_MUTATION'):
    sp=importlib.util.spec_from_file_location('s05_oracle_mutant',os.environ['S05_ORACLE_MUTATION'])
    m=importlib.util.module_from_spec(sp);sp.loader.exec_module(m)
else:
    import mpr1_reference as m

class ExactCash(unittest.TestCase):
    def setUp(self): self.c=m.scenarios()[0]
    def test_normal_loss_and_cash_equations(self):
        r=m.evaluate(self.c);self.assertEqual((r['quantity'],r['q_cash'],r['net_pnl'],r['ending_cash']),('36','99','-24.48','9975.52'))
        self.assertEqual(r['cash_after_entry'],'6390.82');self.assertEqual(r['mark_equity'],'9998.74')
    def test_target_and_gap_are_separate_paths(self):
        target=m.evaluate(m.scenarios()[1]);gap=m.evaluate(m.scenarios()[2]);self.assertEqual(target['net_pnl'],'46.08');self.assertEqual(gap['net_pnl'],'-42.48');self.assertTrue(gap['actual_scenario_loss_exceeds_budget']);self.assertFalse(target['entry_permitted_by_this_calculator'])
    def test_unfunded_small_cash_is_zero_quantity(self):
        r=m.evaluate(m.scenarios()[3]);self.assertEqual(r['quantity'],'0');self.assertEqual(r['ending_cash'],'12');self.assertEqual(r['total_explicit_fees'],'0')
    def test_known_and_after_the_fact_cost_changes_are_not_the_same_sizing(self):
        before=m.evaluate(m.scenarios()[4]);after=m.evaluate(m.scenarios()[5]);self.assertEqual(before['quantity'],'35');self.assertEqual(after['quantity'],'36');self.assertEqual(after['net_pnl'],'-25.2');self.assertTrue(after['normal_budget_exceeded']);self.assertFalse(before['normal_budget_exceeded'])
    def test_no_spread_or_slippage_double_deduction(self):
        r=m.evaluate(self.c);self.assertEqual(m.number(r['net_pnl']),m.number(r['gross_pnl'])-m.number(r['total_explicit_fees']));self.assertEqual(r['total_explicit_fees'],'0.36');self.assertFalse(r['spread_slippage_deducted_again'])
    def test_sub_cent_fee_is_not_rounded_per_partial_execution(self):
        self.assertEqual(m.decimal(m.number('0.005')*2),'0.01');self.assertEqual(m.decimal(m.number('0.005')),'0.005')
    def test_nonfinite_float_exponent_and_noncanonical_inputs_rejected(self):
        for value in ['NaN','Infinity','1e2','01','-0','1\n',100.25,True]:
            with self.subTest(value=value),self.assertRaises(ValueError):m.evaluate(dict(self.c,entry=value))
    def test_currency_units_multiplier_and_grid_not_inferred(self):
        for changes in [{'currency':'USD'},{'quantity_unit':'lots'},{'multiplier':'100'},{'price_tick':'0.1'},{'entry':'100.251'},{'piece_step':'0.1'}]:
            with self.subTest(changes=changes),self.assertRaises(ValueError):m.evaluate(dict(self.c,**changes))
    def test_unknown_or_missing_case_fields_rejected(self):
        c=dict(self.c);c.pop('normal_stop_fill')
        for v in [c,dict(self.c,broker_authorization=True)]:
            with self.assertRaises(ValueError):m.evaluate(v)
    def test_invalid_price_and_negative_fee_rejected(self):
        for changes in [{'entry':'0'},{'normal_stop_fill':'101'},{'initial_cash':'-1'},{'risk_budget':'-1'},{'fee_per_piece_per_side':'-0.005'}]:
            with self.subTest(changes=changes),self.assertRaises(ValueError):m.evaluate(dict(self.c,**changes))
    def test_fixed_stress_quantity_must_be_whole_and_funded(self):
        for q in ['0.5','-1','1000']:
            with self.subTest(q=q),self.assertRaises(ValueError):m.evaluate(dict(self.c,fixed_quantity=q))
    def test_repeating_rational_is_not_silently_rounded(self):
        with self.assertRaisesRegex(ValueError,'NON_TERMINATING'):m.decimal(Fraction(1,3))
    def test_checked_in_golden_is_exactly_reproducible(self):
        self.assertEqual(json.loads((HERE/'golden-ledger.json').read_text()),m.build_golden())
    def test_original_javascript_arithmetic_matches_all_six_fraction_cases(self):
        p=subprocess.run([os.environ.get('S05_NODE','node'),str(HERE/'original_probe.mjs'),os.environ['S05_PLATFORM'],str(HERE/'golden-ledger.json')],capture_output=True,text=True,check=True)
        out=json.loads(p.stdout);self.assertEqual(out['arithmetic'],[c['expected']for c in m.build_golden()['cases']])
    def test_archived_original_MPG05_outputs_agree_but_are_not_new_performance(self):
        with zipfile.ZipFile(os.environ['S05_SOURCES']) as z:
            old=json.loads(z.read('materials/data/master_1_0/MPG05.json'),parse_float=Decimal)['inputs_and_outputs']
        self.assertEqual(old['quantity'],36);self.assertEqual(old['cash_after_buy'],Decimal('6390.82'))
        self.assertEqual([x['net_pnl']for x in old['alternative_paths']],[Decimal('-24.48'),Decimal('46.08'),Decimal('-42.48')])
        self.assertTrue(old['paths_are_alternatives_not_one_time_series'])
    def test_original_LAB03_commission_rule_must_not_be_substituted_for_MPR1(self):
        path=Path(os.environ['S05_LAB03'])
        spec=importlib.util.spec_from_file_location('original_lab03_s05',path);lab=importlib.util.module_from_spec(spec);sys.modules[spec.name]=lab;spec.loader.exec_module(lab)
        cfg=replace(lab.Config(),fee_fixed=Decimal('0'),fee_per_share=Decimal('0.005'))
        self.assertEqual(lab.commission(1,cfg),Decimal('0.01'));self.assertEqual(lab.commission(2,cfg),Decimal('0.01'))
        self.assertEqual(lab.commission(1,cfg)*2,Decimal('0.02'));self.assertNotEqual(lab.commission(1,cfg),Decimal(m.decimal(m.number('0.005'))))
    def test_missing_FX_metadata_does_not_gain_a_conversion_default(self):
        with self.assertRaisesRegex(ValueError,'MPR1_UNITS_REQUIRED'):m.evaluate(dict(self.c,currency='CHF_per_USD'))

class SchemaBoundaries(unittest.TestCase):
    @classmethod
    def setUpClass(cls): cls.s=json.loads((ROOT/'contracts/domain/v1/schema.json').read_text())['$defs']
    def test_unknown_commission_is_not_a_zero_S02_Money(self):
        self.assertIn('commission',self.s['Deal']['required']);self.assertEqual(self.s['Deal']['properties']['commission'],{'$ref':'#/$defs/Money'})
        self.assertIn('value',self.s['Money']['required']);self.assertIn('currency',self.s['Money']['required'])
    def test_S02_account_carries_dimensions_missing_in_old_order_origin(self):
        self.assertTrue({'provider','account_id','environment','currency','model'} <= set(self.s['AccountRef']['required']))
    def test_cashflow_and_deal_commission_need_explicit_deduplication_contract(self):
        self.assertIn('commission',self.s['Cashflow']['properties']['kind']['enum']);self.assertIn('related_deal_id',self.s['Cashflow']['required'])
        doc=json.loads((HERE/'order-state-machine.json').read_text());self.assertFalse(doc['product_writer_implemented']);self.assertIn('charge_identity',doc['integration_requirements'])

if __name__=='__main__':unittest.main()
