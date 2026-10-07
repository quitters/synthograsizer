"""The image-prompt template generators carry the craft rules from docs/ENGINE_DESIGN.md; the story, p5.js and agent generators do not.

The model is faked at llm_text, so this checks what the model is TOLD, which is the thing the rules change.
"""
from types import SimpleNamespace

import pytest

from backend.services import template_engine as te

RULES_MARK = "## CRAFT RULES FOR IMAGE PROMPTS"


class FakeManager(SimpleNamespace):
    def __init__(self):
        super().__init__(genai_client=object(), seen=[])

    def llm_text(self, contents, model, json_mode=False):
        self.seen.append(contents)
        return "{}"

    def analyze_image_to_prompt(self, image_bytes, model_name=None):
        return "a grey harbour at dawn"


def system_prompt_of(call):
    mgr = FakeManager()
    call(mgr)
    assert mgr.seen, "the generator never reached the model"
    return mgr.seen[-1][0]


def test_rules_name_the_recipes_that_were_found_by_looking():
    for needle in ("Bundle values that must agree", "no captions, titles or lettering", "generic or unlabelled", "trades or places", "Invent, do not borrow"):
        assert needle in te.IMAGE_PROMPT_CRAFT_RULES


@pytest.mark.parametrize("name,call", [
    ("text", lambda m: te.generate_template(m, "lost films")),
    ("analysis", lambda m: te.generate_template_from_analysis(m, "a grey harbour")),
    ("hybrid", lambda m: te.generate_template_hybrid(m, b"x", "ports and weather")),
    ("remix", lambda m: te.remix_template(m, {"promptTemplate": "a {{x}}", "variables": []}, "add a mood")),
])
def test_image_prompt_generators_get_the_craft_rules(name, call):
    assert RULES_MARK in system_prompt_of(call)


def test_story_generator_does_not():
    assert RULES_MARK not in system_prompt_of(lambda m: te.generate_story_template(m, "a heist"))


def test_p5_generator_does_not():
    assert RULES_MARK not in system_prompt_of(lambda m: te.generate_p5_template(m, "a spinning ring"))
