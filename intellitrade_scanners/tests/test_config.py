# coding: utf-8
"""Deployment-path resolution: defaults match the VPS convention, every
directory overridable via environment."""
import os

from intellitrade_scanners import config


def test_defaults_match_vps_convention(monkeypatch):
    for var in ("INTELLITRADE_HOME", "INTELLITRADE_CONFIG_ENV",
                "INTELLITRADE_LOG_DIR", "INTELLITRADE_OUT_DIR"):
        monkeypatch.delenv(var, raising=False)
    # Compose expected paths with os.path.join so the separator matches the
    # running OS (VPS is Windows; CI is Linux) — config.py uses os.path.join too.
    assert config.home() == r"C:\IntelliTrade"
    assert config.env_file() == os.path.join(r"C:\IntelliTrade", "config", ".env")
    assert config.log_dir() == os.path.join(r"C:\IntelliTrade", "logs")
    assert config.out_dir() == os.path.join(r"C:\IntelliTrade", "out")


def test_home_override_moves_everything(monkeypatch):
    monkeypatch.setenv("INTELLITRADE_HOME", r"D:\deploy")
    for var in ("INTELLITRADE_CONFIG_ENV", "INTELLITRADE_LOG_DIR", "INTELLITRADE_OUT_DIR"):
        monkeypatch.delenv(var, raising=False)
    assert config.env_file() == os.path.join(r"D:\deploy", "config", ".env")
    assert config.log_dir() == os.path.join(r"D:\deploy", "logs")
    assert config.out_dir() == os.path.join(r"D:\deploy", "out")


def test_individual_overrides_win(monkeypatch):
    monkeypatch.setenv("INTELLITRADE_HOME", r"D:\deploy")
    monkeypatch.setenv("INTELLITRADE_LOG_DIR", r"E:\logs")
    monkeypatch.setenv("INTELLITRADE_CONFIG_ENV", r"E:\secrets\.env")
    assert config.log_dir() == r"E:\logs"
    assert config.env_file() == r"E:\secrets\.env"
    assert config.out_dir() == os.path.join(r"D:\deploy", "out")  # still from home


def test_load_env_is_safe_without_file(monkeypatch, tmp_path):
    # Points at a nonexistent .env; must not raise regardless of dotenv presence.
    monkeypatch.setenv("INTELLITRADE_CONFIG_ENV", str(tmp_path / "nope" / ".env"))
    monkeypatch.chdir(tmp_path)  # keep dotenv's fallback search away from the repo
    config.load_env()


def test_load_env_reads_values(monkeypatch, tmp_path):
    envfile = tmp_path / ".env"
    envfile.write_text("INTELLITRADE_TEST_MARKER=hello\n", encoding="utf-8")
    monkeypatch.setenv("INTELLITRADE_CONFIG_ENV", str(envfile))
    monkeypatch.delenv("INTELLITRADE_TEST_MARKER", raising=False)
    config.load_env()
    try:
        import dotenv  # noqa: F401
    except ImportError:
        return  # dotenv absent: load_env is a documented no-op
    assert os.environ.get("INTELLITRADE_TEST_MARKER") == "hello"
    monkeypatch.delenv("INTELLITRADE_TEST_MARKER", raising=False)
