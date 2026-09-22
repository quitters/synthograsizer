"""Tests for backend.service.pricing — the credit rate table.

The table is keyed by model id, and several config constants deliberately
point at the same id. That is safe only as long as no price depends on two
constants being *different* models. This suite pins the case that broke: the
Commons standardised on 3.8 Flash while the suite's fast/demo/template
constants were moving to the same id, which would have collapsed a 1-credit
chat turn and a 5-credit sketch call onto one table key and charged the cheap
path five times over.
"""
import pytest

from backend import config
from backend.service import pricing


class TestSharedModelIds:
    def test_fast_demo_and_template_share_one_id(self):
        """Documents the standardisation the prices must survive."""
        assert config.MODEL_FAST == config.MODEL_DEMO == config.MODEL_TEMPLATE_GEN_FAST

    def test_commons_shares_that_id_too(self):
        assert config.MODEL_COMMONS_SKETCH == config.MODEL_FAST
        assert config.MODEL_COMMONS_PANEL == config.MODEL_FAST

    def test_no_price_is_lost_to_a_collapsed_key(self):
        """Every priced constant must still resolve to the rate it intends.

        Written as a count check because the failure mode is silent: duplicate
        keys in a dict literal collapse, the later one wins, and nothing warns.
        """
        priced = [config.MODEL_FAST, config.MODEL_TEXT_CHAT]
        assert len(pricing.TEXT_MODEL_CREDITS) == len(set(priced))


class TestTextRates:
    def test_a_fast_call_costs_one_credit(self):
        credits, _, kind = pricing.resolve("chat", config.MODEL_FAST)
        assert (credits, kind) == (1, "call")

    def test_demo_mode_is_a_feature_cap_not_a_cost_cap(self):
        assert pricing.resolve("chat", config.MODEL_DEMO)[0] == 1

    def test_pro_costs_five(self):
        assert pricing.resolve("chat", config.MODEL_TEXT_CHAT)[0] == 5

    def test_an_unlisted_model_is_rejected_rather_than_free(self):
        with pytest.raises(pricing.InvalidModel):
            pricing.resolve("chat", "gemini-not-a-real-model")


class TestCommonsSketch:
    def test_priced_by_workload_not_by_model_id(self):
        """The sketch rate must not move when the shared text rate moves."""
        expected = pricing.COMMONS_SKETCH_CREDITS_PER_CALL * pricing.COMMONS_SKETCH_CALLS
        assert pricing.resolve("commons_sketch", config.MODEL_COMMONS_SKETCH)[0] == expected

    def test_still_reserves_the_worst_case_two_calls(self):
        assert pricing.resolve("commons_sketch", config.MODEL_COMMONS_SKETCH)[0] == 10

    def test_costs_more_than_the_chat_turn_it_shares_a_model_with(self):
        sketch = pricing.resolve("commons_sketch", config.MODEL_COMMONS_SKETCH)[0]
        chat = pricing.resolve("chat", config.MODEL_FAST)[0]
        assert sketch > chat

    def test_quoted_rate_matches_what_is_charged(self):
        quoted = pricing.client_rates()["commons_sketch"]
        assert quoted == pricing.resolve("commons_sketch", config.MODEL_COMMONS_SKETCH)[0]
