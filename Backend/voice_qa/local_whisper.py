"""Free speech-to-text with the open-source Whisper model running on this server.

Audio is decoded with the ffmpeg binary bundled by imageio-ffmpeg (no system
install needed), converted to 16 kHz mono and transcribed on the CPU. The model
is downloaded once by Whisper on first use, then works offline.
"""

import importlib.util
import logging
import subprocess
import tempfile
import threading
import wave
from pathlib import Path

from django.conf import settings

logger = logging.getLogger(__name__)

SUPPORTED_LANGUAGES = {"fr", "en", "ar"}
_model = None
_model_name = None
_lock = threading.Lock()


class LocalTranscriptionError(Exception):
    """Decoding or transcription failed. ``message`` is safe to show."""

    def __init__(self, message):
        super().__init__(message)
        self.message = message


def available():
    return (
        importlib.util.find_spec("whisper") is not None
        and importlib.util.find_spec("imageio_ffmpeg") is not None
    )


def _load_model():
    global _model, _model_name
    name = settings.VOICE_QA_WHISPER_MODEL
    with _lock:
        if _model is None or _model_name != name:
            import whisper

            logger.info("Loading local Whisper model %s", name)
            _model = whisper.load_model(name, device="cpu")
            _model_name = name
    return _model


def _decode(audio_bytes, suffix):
    """Any supported audio → mono 16 kHz float samples (numpy array)."""
    import imageio_ffmpeg
    import numpy as np

    with tempfile.TemporaryDirectory(prefix="edumind-voice-") as directory:
        source = Path(directory) / f"input{suffix}"
        target = Path(directory) / "audio.wav"
        source.write_bytes(audio_bytes)
        command = [
            imageio_ffmpeg.get_ffmpeg_exe(),
            "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
            "-i", str(source),
            "-t", str(settings.VOICE_QA_MAX_RECORDING_SECONDS + 30),
            "-vn", "-ac", "1", "-ar", "16000", "-f", "wav",
            str(target),
        ]
        try:
            result = subprocess.run(
                command, capture_output=True, text=True,
                timeout=settings.VOICE_QA_FFMPEG_TIMEOUT_SECONDS,
            )
        except subprocess.TimeoutExpired as error:
            raise LocalTranscriptionError("Reading the recording took too long.") from error
        except OSError as error:
            logger.exception("ffmpeg could not start")
            raise LocalTranscriptionError("The audio decoder could not be started.") from error
        if result.returncode != 0 or not target.exists():
            logger.warning("ffmpeg failed: %s", result.stderr[:300])
            raise LocalTranscriptionError("This recording could not be read. Try another file.")

        with wave.open(str(target), "rb") as wav_file:
            frames = wav_file.readframes(wav_file.getnframes())
    return np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0


def transcribe(audio_bytes, filename, language_hint="auto"):
    """Return ``(text, language_code)`` using the local Whisper model."""
    samples = _decode(audio_bytes, Path(filename).suffix.lower() or ".audio")
    if samples.size < 16000 * 0.3:  # under 0.3 s of sound
        raise LocalTranscriptionError("The recording is too short. Ask your question again.")

    model = _load_model()
    result = model.transcribe(
        samples,
        fp16=False,
        language=language_hint if language_hint in SUPPORTED_LANGUAGES else None,
        condition_on_previous_text=False,
    )
    text = " ".join((result.get("text") or "").split())
    language = (result.get("language") or "").lower()
    return text, language if language in SUPPORTED_LANGUAGES else ""
