import time
import functools
from typing import Tuple

# Error substrings that indicate a transient (retryable) server error
TRANSIENT_INDICATORS: Tuple[str, ...] = ("500", "503", "INTERNAL", "UNAVAILABLE", "RESOURCE_EXHAUSTED")

def retry_on_transient(max_attempts: int = 3, backoff_base: float = 5.0):
    """Decorator that retries a function on transient Google API errors.
    
    Uses linear backoff: wait = backoff_base * attempt_number.
    Non-transient errors are raised immediately.
    """
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            last_err = None
            for attempt in range(max_attempts):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    last_err = e
                    err_str = str(e)
                    if any(indicator in err_str for indicator in TRANSIENT_INDICATORS):
                        wait = backoff_base * (attempt + 1)
                        print(f"Transient error in {func.__name__} (attempt {attempt+1}/{max_attempts}), retrying in {wait}s: {err_str[:120]}")
                        time.sleep(wait)
                        continue
                    raise  # Non-transient — don't retry
            raise last_err  # All retries exhausted
        return wrapper
    return decorator
