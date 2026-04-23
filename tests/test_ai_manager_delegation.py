"""Verify AIManager's facade pattern is wired correctly.

AIManager assigns service-module functions as class attributes (e.g.
`generate_image = backend.services.image_gen.generate_image`). Python's
descriptor protocol then turns those into bound methods at attribute lookup,
so calling `ai_manager.generate_image(...)` correctly passes the AIManager
instance as `self`.

These tests guard against the silent kind of refactor breakage where a
service function gets renamed, removed, or accidentally wrapped — the
attribute would still exist on the class but point at the wrong callable.
"""
import inspect

import backend.services.analysis as analysis_svc
import backend.services.image_gen as image_gen_svc
import backend.services.narrative as narrative_svc
import backend.services.template_engine as template_engine_svc
import backend.services.text_gen as text_gen_svc
import backend.services.video_gen as video_gen_svc
import backend.services.workflow as workflow_svc
import backend.utils.image_utils as image_utils
from backend.ai_manager import AIManager, ai_manager


# Map of AIManager attribute name → (module, expected callable name).
# Whenever we add or rename a delegated method, this map should change too —
# and the test will fail loudly until it does.
EXPECTED_DELEGATIONS = {
    "chat": (text_gen_svc, "chat"),
    "generate_text": (text_gen_svc, "generate_text"),
    "generate_text_stream": (text_gen_svc, "generate_text_stream"),
    "generate_image": (image_gen_svc, "generate_image"),
    "_generate_image_gemini": (image_gen_svc, "_generate_image_gemini"),
    "_generate_image_imagen": (image_gen_svc, "_generate_image_imagen"),
    "smart_transform": (image_gen_svc, "smart_transform"),
    "generate_video": (video_gen_svc, "generate_video"),
    "analyze_image": (analysis_svc, "analyze_image"),
    "analyze_image_to_prompt": (analysis_svc, "analyze_image_to_prompt"),
    "analyze_image_quick": (analysis_svc, "analyze_image_quick"),
    "_extract_text_from_response": (analysis_svc, "_extract_text_from_response"),
    "generate_template": (template_engine_svc, "generate_template"),
    "generate_template_from_analysis": (template_engine_svc, "generate_template_from_analysis"),
    "generate_template_hybrid": (template_engine_svc, "generate_template_hybrid"),
    "generate_template_from_images": (template_engine_svc, "generate_template_from_images"),
    "remix_template": (template_engine_svc, "remix_template"),
    "generate_story_template": (template_engine_svc, "generate_story_template"),
    "generate_narrative": (narrative_svc, "generate_narrative"),
    "generate_video_variations": (narrative_svc, "generate_video_variations"),
    "generate_image_variation_prompts": (narrative_svc, "generate_image_variation_prompts"),
    "curate_workflow": (workflow_svc, "curate_workflow"),
    "embed_metadata": (image_utils, "embed_metadata"),
    "extract_metadata": (image_utils, "extract_metadata"),
    "get_image_dimensions": (image_utils, "get_image_dimensions"),
    "map_to_closest_aspect_ratio": (image_utils, "map_to_closest_aspect_ratio"),
    "ensure_aspect_ratio": (image_utils, "ensure_aspect_ratio"),
    "clean_midjourney_prompt": (image_utils, "clean_midjourney_prompt"),
    "_placeholder_image": (image_utils, "_placeholder_image"),
}


class TestDelegationBindings:
    def test_singleton_exists(self):
        assert isinstance(ai_manager, AIManager)

    def test_every_delegated_attribute_resolves(self):
        for attr, (module, expected_name) in EXPECTED_DELEGATIONS.items():
            class_attr = getattr(AIManager, attr, None)
            assert class_attr is not None, f"AIManager missing delegated attr: {attr}"
            expected = getattr(module, expected_name, None)
            assert expected is not None, (
                f"Service module {module.__name__} missing function {expected_name}"
            )
            assert class_attr is expected, (
                f"AIManager.{attr} is not bound to {module.__name__}.{expected_name}"
            )

    def test_self_binding_works_via_descriptor_protocol(self):
        """Bound-method check — accessing through an instance must yield a method
        whose first positional argument is consumed by `self`."""
        for attr in EXPECTED_DELEGATIONS:
            bound = getattr(ai_manager, attr)
            # Functions assigned as class attributes become bound methods on
            # instance access. inspect.ismethod confirms the binding.
            assert inspect.ismethod(bound), (
                f"AIManager.{attr} did not bind as a method on instance access"
            )
            assert bound.__self__ is ai_manager
