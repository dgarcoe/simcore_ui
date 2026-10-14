"""Local fallback for cloud LLMs without credentials (loaded by Python at start-up).

Simcore scenarios name their model (e.g. ``gpt-4o-mini``). When that model
belongs to a cloud provider whose API key is not set and SIMCORE_FALLBACK_MODEL
is defined (scripts/simcore-up.sh sets it to the local Ollama model), calls
are sent to the fallback instead of failing with "Missing credentials".
Simcore itself is not modified: we wrap ``litellm.acompletion`` once litellm
is imported, so other Python processes in the image are not affected.
"""

from __future__ import annotations

import importlib.abc
import importlib.machinery
import logging
import os
import sys

FALLBACK_ENV = "SIMCORE_FALLBACK_MODEL"

PROVIDER_KEYS = {
    "openai": ("OPENAI_API_KEY",),
    "text-completion-openai": ("OPENAI_API_KEY",),
    "anthropic": ("ANTHROPIC_API_KEY",),
    "gemini": ("GEMINI_API_KEY", "GOOGLE_API_KEY"),
    "mistral": ("MISTRAL_API_KEY",),
    "groq": ("GROQ_API_KEY",),
    "deepseek": ("DEEPSEEK_API_KEY",),
    "openrouter": ("OPENROUTER_API_KEY",),
    "cohere": ("COHERE_API_KEY",),
    "cohere_chat": ("COHERE_API_KEY",),
    "xai": ("XAI_API_KEY",),
    "together_ai": ("TOGETHERAI_API_KEY", "TOGETHER_API_KEY"),
}

log = logging.getLogger("simcore.llm.fallback")
_warned: set[str] = set()


def provider_of(model: str) -> str | None:
    """Best-effort provider name for a LiteLLM model string."""
    if "/" in model:
        return model.split("/", 1)[0]
    m = model.lower()
    if m.startswith(("gpt-", "o1", "o3", "o4", "chatgpt", "text-davinci", "davinci")):
        return "openai"
    if m.startswith("claude"):
        return "anthropic"
    if m.startswith("gemini"):
        return "gemini"
    if m.startswith(("mistral", "mixtral", "codestral")):
        return "mistral"
    return None


def substitute(model: str | None, kwargs: dict, env=os.environ) -> str | None:
    """Returns the model to use, or None to keep the requested one."""
    fallback = env.get(FALLBACK_ENV, "").strip()
    if not fallback or not model or model == fallback or kwargs.get("api_key"):
        return None
    keys = PROVIDER_KEYS.get(provider_of(model) or "")
    if not keys or any(env.get(k, "").strip() for k in keys):
        return None
    if model not in _warned:
        _warned.add(model)
        log.warning("%s needs %s, which is not set: using local %s instead", model, keys[0], fallback)
    return fallback


def patch(litellm_module) -> None:
    original = litellm_module.acompletion
    if getattr(original, "_simcore_fallback", False):
        return

    async def acompletion(*args, **kwargs):
        model = kwargs.get("model", args[0] if args else None)
        replacement = substitute(model, kwargs)
        if replacement:
            if "model" in kwargs or not args:
                kwargs["model"] = replacement
            else:
                args = (replacement, *args[1:])
        return await original(*args, **kwargs)

    acompletion._simcore_fallback = True  # type: ignore[attr-defined]
    litellm_module.acompletion = acompletion


class _PatchOnImport(importlib.abc.MetaPathFinder):
    """Applies ``patch`` right after ``import litellm`` finishes.

    The real loader is kept (litellm reads package resources through it);
    only its ``exec_module`` is wrapped.
    """

    def find_spec(self, fullname, path, target=None):
        if fullname != "litellm":
            return None
        sys.meta_path.remove(self)
        spec = importlib.machinery.PathFinder.find_spec(fullname, path)
        if spec is None or spec.loader is None:
            return spec
        exec_module = spec.loader.exec_module

        def exec_and_patch(module):
            exec_module(module)
            try:
                patch(module)
            except Exception as exc:  # never break Simcore because of the fallback
                log.warning("could not install the local LLM fallback: %s", exc)

        spec.loader.exec_module = exec_and_patch
        return spec


if os.environ.get(FALLBACK_ENV, "").strip() and "litellm" not in sys.modules:
    sys.meta_path.insert(0, _PatchOnImport())
