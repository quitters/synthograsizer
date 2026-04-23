"""Lyria RealTime music session manager.

Wraps the Google GenAI Lyria RealTime API, managing a persistent WebSocket
session for real-time music generation and streaming PCM audio chunks back
to the browser via a FastAPI WebSocket relay.

Key design: `client.aio.live.music.connect()` returns an async context manager,
so the session only lives inside the `async with` block. We run the entire
session lifecycle in a background task (`_session_loop`) that keeps the
context manager alive. Control commands are sent via an asyncio.Queue.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Optional

from google import genai as genai_sdk
from google.genai import types

from backend import config

logger = logging.getLogger(__name__)

# Scale enum mapping — UI sends short strings, we convert to SDK enum values
SCALE_MAP = {
    "SCALE_UNSPECIFIED": "SCALE_UNSPECIFIED",
    "C_MAJOR_A_MINOR": "C_MAJOR_A_MINOR",
    "D_FLAT_MAJOR_B_FLAT_MINOR": "D_FLAT_MAJOR_B_FLAT_MINOR",
    "D_MAJOR_B_MINOR": "D_MAJOR_B_MINOR",
    "E_FLAT_MAJOR_C_MINOR": "E_FLAT_MAJOR_C_MINOR",
    "E_MAJOR_D_FLAT_MINOR": "E_MAJOR_D_FLAT_MINOR",
    "F_MAJOR_D_MINOR": "F_MAJOR_D_MINOR",
    "G_FLAT_MAJOR_E_FLAT_MINOR": "G_FLAT_MAJOR_E_FLAT_MINOR",
    "G_MAJOR_E_MINOR": "G_MAJOR_E_MINOR",
    "A_FLAT_MAJOR_F_MINOR": "A_FLAT_MAJOR_F_MINOR",
    "A_MAJOR_G_FLAT_MINOR": "A_MAJOR_G_FLAT_MINOR",
    "B_FLAT_MAJOR_G_MINOR": "B_FLAT_MAJOR_G_MINOR",
    "B_MAJOR_A_FLAT_MINOR": "B_MAJOR_A_FLAT_MINOR",
}

MUSIC_MODE_MAP = {
    "QUALITY": "QUALITY",
    "DIVERSITY": "DIVERSITY",
    "VOCALIZATION": "VOCALIZATION",
}

# Hard cap on outstanding music control messages. A real session sends a
# handful per second at most (knob turns, prompt changes), so 64 covers
# bursty UIs without ever realistically blocking.
CMD_QUEUE_MAX = 64


class MusicManager:
    """Manages a single Lyria RealTime session.

    The genai_client is shared with AIManager (same API key). This class
    gets the client passed in — it never creates its own.

    Architecture: The Lyria SDK returns an async context manager from
    `connect()`, so the session must live inside an `async with` block.
    We run the session in a background task (`_session_loop`) and
    communicate with it via an `asyncio.Queue` for commands and a
    callback for audio output.
    """

    def __init__(self, genai_client):
        # Lyria RealTime requires api_version='v1alpha'. Create a dedicated
        # client rather than modifying the shared one (which could break
        # other API calls that use the default version).
        api_key = genai_client._api_client.api_key
        self.client = genai_sdk.Client(
            api_key=api_key,
            http_options={"api_version": "v1alpha"},
        )
        self.session: Any = None
        self.connected = False
        self.playing = False
        self.current_prompts: list[dict] = []
        self.current_config: dict = {}
        self._session_task: Optional[asyncio.Task] = None
        # Cap the queue so a misbehaving client (or an unresponsive Lyria
        # session) cannot pin unbounded memory. If we ever fill it, the
        # producer drops the oldest backlog rather than blocking forever —
        # see `send_command` for the overflow policy.
        self._cmd_queue: asyncio.Queue = asyncio.Queue(maxsize=CMD_QUEUE_MAX)
        self._send_callback: Optional[Any] = None
        self._session_ready = asyncio.Event()

    async def start(self, send_callback) -> None:
        """Start the Lyria session in a background task.

        Args:
            send_callback: async callable that accepts bytes (PCM audio)
                          or str (JSON text messages).
        """
        if self._session_task and not self._session_task.done():
            logger.warning("Session already running — stopping first")
            await self.shutdown()

        self._send_callback = send_callback
        self._session_ready.clear()
        # Re-create the queue so a previous session's leftover commands don't
        # leak into the new one. Keep the same cap.
        self._cmd_queue = asyncio.Queue(maxsize=CMD_QUEUE_MAX)
        self._session_task = asyncio.create_task(self._session_loop())

        # Wait for the session to connect (with timeout)
        try:
            await asyncio.wait_for(self._session_ready.wait(), timeout=15.0)
        except asyncio.TimeoutError:
            raise RuntimeError("Timed out connecting to Lyria")

    async def shutdown(self) -> None:
        """Stop the session background task."""
        if self._session_task and not self._session_task.done():
            self._session_task.cancel()
            try:
                await self._session_task
            except asyncio.CancelledError:
                pass
        self.session = None
        self.connected = False
        self.playing = False
        self._session_ready.clear()
        logger.info("Lyria session shut down")

    async def _session_loop(self) -> None:
        """Background task that holds the async context manager open.

        Runs two concurrent sub-tasks:
        1. Audio relay — reads PCM chunks from Lyria and forwards them
        2. Command processor — reads commands from the queue and executes them
        """
        try:
            async with self.client.aio.live.music.connect(
                model=config.MODEL_MUSIC_REALTIME
            ) as session:
                self.session = session
                self.connected = True
                self._session_ready.set()
                logger.info("Lyria RealTime session connected")

                if self._send_callback:
                    await self._send_callback(
                        json.dumps({"status": "connected"})
                    )

                # Run audio relay and command processor concurrently
                relay = asyncio.create_task(self._audio_relay(session))
                cmds = asyncio.create_task(self._command_processor(session))
                try:
                    await asyncio.gather(relay, cmds)
                finally:
                    relay.cancel()
                    cmds.cancel()
                    for t in (relay, cmds):
                        try:
                            await t
                        except asyncio.CancelledError:
                            pass

        except asyncio.CancelledError:
            logger.info("Session loop cancelled")
        except Exception as e:
            logger.error("Session loop error: %s", e)
            if self._send_callback:
                try:
                    await self._send_callback(
                        json.dumps({"error": str(e)})
                    )
                except Exception:
                    pass
        finally:
            self.session = None
            self.connected = False
            self.playing = False

    async def _audio_relay(self, session) -> None:
        """Receive PCM audio chunks from Lyria and forward via callback."""
        try:
            async for message in session.receive():
                try:
                    audio_chunks = message.server_content.audio_chunks
                    if audio_chunks:
                        for chunk in audio_chunks:
                            if self._send_callback:
                                await self._send_callback(chunk.data)
                except AttributeError:
                    logger.debug("Non-audio message: %s", type(message))
                except Exception as e:
                    logger.error("Error processing audio chunk: %s", e)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.error("Audio relay error: %s", e)

    async def _command_processor(self, session) -> None:
        """Process control commands from the queue."""
        try:
            while True:
                cmd = await self._cmd_queue.get()
                action = cmd.get("action", "")
                try:
                    result_status = await self._execute_command(session, cmd)
                    if result_status and self._send_callback:
                        await self._send_callback(
                            json.dumps({"status": result_status})
                        )
                except Exception as e:
                    logger.error("Command error (%s): %s", action, e)
                    if self._send_callback:
                        await self._send_callback(
                            json.dumps({"error": str(e)})
                        )
        except asyncio.CancelledError:
            raise

    async def _execute_command(self, session, cmd: dict) -> Optional[str]:
        """Execute a single command against the session. Returns status string."""
        action = cmd["action"]

        if action == "play":
            await session.play()
            self.playing = True
            return "playing"

        elif action == "pause":
            await session.pause()
            self.playing = False
            return "paused"

        elif action == "stop":
            await session.stop()
            self.playing = False
            return "stopped"

        elif action == "reset_context":
            await session.reset_context()
            return "context_reset"

        elif action == "set_prompts":
            prompts = cmd.get("prompts", [])
            weighted = [
                types.WeightedPrompt(
                    text=p["text"], weight=float(p.get("weight", 1.0))
                )
                for p in prompts
            ]
            await session.set_weighted_prompts(prompts=weighted)
            self.current_prompts = prompts
            logger.debug("Prompts updated: %s", [p["text"][:40] for p in prompts])
            return "prompts_updated"

        elif action == "set_config":
            cfg = cmd.get("config", {})
            kwargs = self._build_config_kwargs(cfg)
            live_cfg = types.LiveMusicGenerationConfig(**kwargs)
            await session.set_music_generation_config(config=live_cfg)
            self.current_config = cfg
            logger.debug("Config updated: %s", cfg)
            return "config_updated"

        elif action == "crossfade_prompts":
            old_p = cmd.get("old_prompts", self.current_prompts)
            new_p = cmd.get("new_prompts", [])
            steps = cmd.get("steps", 5)
            duration = cmd.get("duration", 1.5)
            await self._crossfade(session, old_p, new_p, steps, duration)
            return "prompts_crossfaded"

        else:
            return None

    def _build_config_kwargs(self, cfg: dict) -> dict[str, Any]:
        """Convert a config dict from the UI into SDK kwargs."""
        kwargs: dict[str, Any] = {}

        if "bpm" in cfg:
            kwargs["bpm"] = int(cfg["bpm"])
        if "density" in cfg:
            kwargs["density"] = float(cfg["density"])
        if "brightness" in cfg:
            kwargs["brightness"] = float(cfg["brightness"])
        if "guidance" in cfg:
            kwargs["guidance"] = float(cfg["guidance"])
        if "temperature" in cfg:
            kwargs["temperature"] = float(cfg["temperature"])
        if "top_k" in cfg:
            kwargs["top_k"] = int(cfg["top_k"])
        if "mute_bass" in cfg:
            kwargs["mute_bass"] = bool(cfg["mute_bass"])
        if "mute_drums" in cfg:
            kwargs["mute_drums"] = bool(cfg["mute_drums"])
        if "only_bass_and_drums" in cfg:
            kwargs["only_bass_and_drums"] = bool(cfg["only_bass_and_drums"])

        if "scale" in cfg and cfg["scale"] in SCALE_MAP:
            kwargs["scale"] = getattr(types.Scale, SCALE_MAP[cfg["scale"]], None)

        if "music_generation_mode" in cfg and cfg["music_generation_mode"] in MUSIC_MODE_MAP:
            kwargs["music_generation_mode"] = getattr(
                types.MusicGenerationMode,
                MUSIC_MODE_MAP[cfg["music_generation_mode"]],
                None,
            )

        return kwargs

    async def _crossfade(
        self, session, old_prompts, new_prompts, steps=5, duration=1.5
    ) -> None:
        """Gradually transition from old to new prompts."""
        step_delay = duration / steps

        for i in range(1, steps + 1):
            t = i / steps
            blended = []

            for p in old_prompts:
                blended.append({
                    "text": p["text"],
                    "weight": p.get("weight", 1.0) * (1.0 - t),
                })
            for p in new_prompts:
                blended.append({
                    "text": p["text"],
                    "weight": p.get("weight", 1.0) * t,
                })

            # Lyria doesn't accept weight=0
            blended = [p for p in blended if p["weight"] > 0.01]
            weighted = [
                types.WeightedPrompt(
                    text=p["text"], weight=float(p["weight"])
                )
                for p in blended
            ]
            await session.set_weighted_prompts(prompts=weighted)
            await asyncio.sleep(step_delay)

        # Final state
        final = [
            types.WeightedPrompt(
                text=p["text"], weight=float(p.get("weight", 1.0))
            )
            for p in new_prompts
        ]
        await session.set_weighted_prompts(prompts=final)
        self.current_prompts = new_prompts

    async def send_command(self, cmd: dict) -> None:
        """Queue a command for the session task to process.

        If the queue is full (the consumer is wedged or Lyria is unresponsive),
        we drop the OLDEST queued command to make room for the new one.
        For a control surface — knob turns, prompt updates — the freshest
        intent matters more than backlog fidelity, so this trade is correct.
        """
        try:
            self._cmd_queue.put_nowait(cmd)
        except asyncio.QueueFull:
            try:
                dropped = self._cmd_queue.get_nowait()
                logger.warning(
                    "Music command queue full — dropped oldest action=%s",
                    dropped.get("action") if isinstance(dropped, dict) else "?",
                )
            except asyncio.QueueEmpty:
                pass
            await self._cmd_queue.put(cmd)

    def get_status(self) -> dict:
        """Return current session status."""
        return {
            "connected": self.connected,
            "playing": self.playing,
            "prompts": self.current_prompts,
            "config": self.current_config,
        }


# Singleton — lazily initialized when first WebSocket connects
music_manager: Optional[MusicManager] = None


def get_music_manager(genai_client) -> MusicManager:
    """Get or create the singleton MusicManager."""
    global music_manager
    if music_manager is None:
        music_manager = MusicManager(genai_client)
    return music_manager
