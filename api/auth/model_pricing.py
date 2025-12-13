import json
import os
from typing import Optional, Tuple
from pydantic import BaseModel


class PriceInfo(BaseModel):
    input_per_1m_tokens: float
    output_per_1m_tokens: float


class ModelPricingService:
    """Service for managing model pricing with hot-reload support."""

    def __init__(self, config_path: str):
        self.config_path = config_path
        self._pricing = None
        self._mtime = None
        self._load_config()

    def _load_config(self):
        """Load pricing config from file."""
        if not os.path.exists(self.config_path):
            raise FileNotFoundError(f"Pricing config not found: {self.config_path}")

        with open(self.config_path, 'r') as f:
            data = json.load(f)

        self._pricing = {
            model: PriceInfo(**config)
            for model, config in data.get("pricing", {}).items()
        }
        self._mtime = os.path.getmtime(self.config_path)

    def _maybe_reload(self):
        """Check mtime and reload if changed."""
        if not os.path.exists(self.config_path):
            return

        current_mtime = os.path.getmtime(self.config_path)
        if current_mtime != self._mtime:
            self._load_config()

    def get_price(self, provider: str, model: str) -> Optional[PriceInfo]:
        """Get pricing info for a model.

        Args:
            provider: Provider name (google, openai, etc)
            model: Model name

        Returns:
            PriceInfo or None if not found
        """
        self._maybe_reload()
        model_key = f"{provider}/{model}"
        return self._pricing.get(model_key)

    def calculate_cost(
        self,
        provider: str,
        model: str,
        input_tokens: int,
        output_tokens: int
    ) -> float:
        """Calculate cost for a request.

        Args:
            provider: Provider name
            model: Model name
            input_tokens: Number of input tokens
            output_tokens: Number of output tokens

        Returns:
            Cost in USD
        """
        price = self.get_price(provider, model)
        if not price:
            return 0.0

        input_cost = (input_tokens / 1_000_000) * price.input_per_1m_tokens
        output_cost = (output_tokens / 1_000_000) * price.output_per_1m_tokens
        return input_cost + output_cost

    def estimate_cost(
        self,
        provider: str,
        model: str,
        estimated_tokens: int
    ) -> float:
        """Estimate cost based on estimated token count.

        Uses 30/70 input/output ratio as default estimate.
        """
        price = self.get_price(provider, model)
        if not price:
            return 0.0

        input_estimated = int(estimated_tokens * 0.3)
        output_estimated = int(estimated_tokens * 0.7)

        input_cost = (input_estimated / 1_000_000) * price.input_per_1m_tokens
        output_cost = (output_estimated / 1_000_000) * price.output_per_1m_tokens
        return input_cost + output_cost


# Singleton instance
_pricing_instance: Optional[ModelPricingService] = None


def get_model_pricing() -> ModelPricingService:
    """Get or create pricing service singleton."""
    global _pricing_instance
    if _pricing_instance is None:
        config_path = os.getenv(
            "DEEPWIKI_AUTH_PRICING_PATH",
            "api/config/model_pricing.json"
        )
        _pricing_instance = ModelPricingService(config_path)
    return _pricing_instance
