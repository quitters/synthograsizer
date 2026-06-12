"""Policy module: tier resolution, hosted pinning, safety precedence, validation.

No network. The Policy singleton persists to ai_studio_config.json — every
test here works on a FRESH Policy() instance with CONFIG_PATH monkeypatched
to a tmp file so the real config is never touched.
"""
import json

import pytest

import backend.policy as policy_mod
from backend.policy import (
    BASELINE_SAFETY,
    Policy,
    TIER_GOOGLE,
    TIER_LOCAL,
    is_hosted,
)


@pytest.fixture()
def fresh_policy(tmp_path, monkeypatch):
    monkeypatch.setattr(policy_mod, "CONFIG_PATH", tmp_path / "ai_studio_config.json")
    monkeypatch.delenv("SYNTH_HOSTED", raising=False)
    monkeypatch.delenv("VERCEL", raising=False)
    return Policy()


class TestHostedDetection:
    def test_not_hosted_by_default(self, monkeypatch):
        monkeypatch.delenv("SYNTH_HOSTED", raising=False)
        monkeypatch.delenv("VERCEL", raising=False)
        assert is_hosted() is False

    def test_synth_hosted_env(self, monkeypatch):
        monkeypatch.setenv("SYNTH_HOSTED", "1")
        assert is_hosted() is True

    def test_vercel_env(self, monkeypatch):
        monkeypatch.delenv("SYNTH_HOSTED", raising=False)
        monkeypatch.setenv("VERCEL", "1")
        assert is_hosted() is True


class TestTierResolution:
    def test_default_tier_is_google(self, fresh_policy):
        assert fresh_policy.effective_tier() == TIER_GOOGLE

    def test_local_tier_when_configured(self, fresh_policy):
        fresh_policy.update(tier=TIER_LOCAL)
        assert fresh_policy.effective_tier() == TIER_LOCAL

    def test_hosted_pins_google_even_if_local_configured(self, fresh_policy, monkeypatch):
        fresh_policy.update(tier=TIER_LOCAL)
        monkeypatch.setenv("SYNTH_HOSTED", "1")
        assert fresh_policy.effective_tier() == TIER_GOOGLE

    def test_unknown_tier_rejected(self, fresh_policy):
        with pytest.raises(ValueError):
            fresh_policy.update(tier="mainframe")


class TestSafetyPrecedence:
    REQ = [{"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"}]
    SAVED = [{"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_LOW_AND_ABOVE"}]

    def test_baseline_when_nothing_configured(self, fresh_policy):
        assert fresh_policy.effective_safety(None) == BASELINE_SAFETY

    def test_saved_defaults_beat_baseline(self, fresh_policy):
        fresh_policy.update(safety_defaults=self.SAVED)
        assert fresh_policy.effective_safety(None) == self.SAVED

    def test_per_request_beats_saved(self, fresh_policy):
        fresh_policy.update(safety_defaults=self.SAVED)
        assert fresh_policy.effective_safety(self.REQ) == self.REQ

    def test_hosted_clamps_per_request_to_saved(self, fresh_policy, monkeypatch):
        fresh_policy.update(safety_defaults=self.SAVED)
        monkeypatch.setenv("SYNTH_HOSTED", "1")
        # An anonymous visitor sending BLOCK_NONE must NOT win on hosted.
        assert fresh_policy.effective_safety(self.REQ) == self.SAVED

    def test_hosted_clamps_to_baseline_when_no_saved(self, fresh_policy, monkeypatch):
        monkeypatch.setenv("SYNTH_HOSTED", "1")
        assert fresh_policy.effective_safety(self.REQ) == BASELINE_SAFETY

    def test_malformed_per_request_ignored(self, fresh_policy):
        assert fresh_policy.effective_safety([{"category": "X"}]) == BASELINE_SAFETY
        assert fresh_policy.effective_safety([]) == BASELINE_SAFETY

    def test_malformed_saved_rejected(self, fresh_policy):
        with pytest.raises(ValueError):
            fresh_policy.update(safety_defaults=[{"category": "", "threshold": "Y"}])


class TestMutationRules:
    def test_hosted_rejects_update(self, fresh_policy, monkeypatch):
        monkeypatch.setenv("SYNTH_HOSTED", "1")
        with pytest.raises(PermissionError):
            fresh_policy.update(tier=TIER_LOCAL)

    def test_local_url_scheme_required(self, fresh_policy):
        with pytest.raises(ValueError):
            fresh_policy.update(local_base_url="ftp://localhost:11434/v1")

    def test_local_url_public_host_rejected(self, fresh_policy):
        with pytest.raises(ValueError):
            fresh_policy.update(local_base_url="http://8.8.8.8/v1")

    def test_local_url_loopback_and_private_ok(self, fresh_policy):
        fresh_policy.update(local_base_url="http://localhost:11434/v1")
        assert fresh_policy.local_base_url == "http://localhost:11434/v1"
        fresh_policy.update(local_base_url="http://192.168.1.50:1234/v1")
        assert fresh_policy.local_base_url == "http://192.168.1.50:1234/v1"

    def test_persistence_roundtrip(self, fresh_policy, tmp_path, monkeypatch):
        fresh_policy.update(tier=TIER_LOCAL, local_model="qwen2.5")
        # A new instance reading the same file sees the saved state.
        reloaded = Policy()
        assert reloaded.effective_tier() == TIER_LOCAL
        assert reloaded.local_model == "qwen2.5"
        # And the file kept any sibling keys (api_key merge behavior).
        data = json.loads(policy_mod.CONFIG_PATH.read_text())
        assert data["backend"]["tier"] == TIER_LOCAL
