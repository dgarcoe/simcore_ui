"""Tests for docker/sitecustomize.py. Run: python -m pytest docker/test_sitecustomize.py"""

import asyncio
import importlib.util
import pathlib
import types

spec = importlib.util.spec_from_file_location("sc", pathlib.Path(__file__).with_name("sitecustomize.py"))
sc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sc)

LOCAL = "ollama/qwen2.5:7b"


def test_substitutes_cloud_models_without_keys():
    env = {"SIMCORE_FALLBACK_MODEL": LOCAL}
    assert sc.substitute("gpt-4o-mini", {}, env) == LOCAL
    assert sc.substitute("openai/gpt-4o", {}, env) == LOCAL
    assert sc.substitute("anthropic/claude-haiku-4-5", {}, env) == LOCAL
    assert sc.substitute("claude-3-5-sonnet", {}, env) == LOCAL


def test_keeps_models_that_can_run():
    env = {"SIMCORE_FALLBACK_MODEL": LOCAL, "OPENAI_API_KEY": "sk-x"}
    assert sc.substitute("gpt-4o-mini", {}, env) is None  # key present
    assert sc.substitute("anthropic/claude-haiku-4-5", {}, env) == LOCAL  # other provider still missing
    assert sc.substitute("ollama/llama3.2:3b", {}, env) is None  # local already
    assert sc.substitute("gpt-4o-mini", {"api_key": "sk-y"}, {"SIMCORE_FALLBACK_MODEL": LOCAL}) is None
    assert sc.substitute("gpt-4o-mini", {}, {}) is None  # fallback disabled
    assert sc.substitute("some-unknown-model", {}, {"SIMCORE_FALLBACK_MODEL": LOCAL}) is None


def test_patch_rewrites_the_call(monkeypatch):
    calls = []

    async def fake_acompletion(*args, **kwargs):
        calls.append((args, kwargs))
        return "ok"

    mod = types.SimpleNamespace(acompletion=fake_acompletion)
    monkeypatch.setenv("SIMCORE_FALLBACK_MODEL", LOCAL)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    sc.patch(mod)
    sc.patch(mod)  # idempotent
    assert asyncio.run(mod.acompletion(model="gpt-4o-mini", messages=[])) == "ok"
    assert asyncio.run(mod.acompletion("gpt-4o-mini", [])) == "ok"
    assert calls[0][1]["model"] == LOCAL
    assert calls[1][0][0] == LOCAL
