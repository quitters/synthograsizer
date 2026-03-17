"""Scope plugin entry point — registers Synthograsizer pipelines."""

from scope.core.plugins.hookspecs import hookimpl


@hookimpl
def register_pipelines(register):
    from .pipelines.glitcher.pipeline import GlitcherPreprocessorPipeline

    register(GlitcherPreprocessorPipeline)
