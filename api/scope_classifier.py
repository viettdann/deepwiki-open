"""Scope classifier to protect against prompt injection attacks."""

import logging
import google.generativeai as genai
from adalflow.components.model_client.ollama_client import OllamaClient
from adalflow.core.types import ModelType

from api.config import get_model_config
from api.openai_client import OpenAIClient
from api.openrouter_client import OpenRouterClient
from api.deepseek_client import DeepSeekClient
from api.azureai_client import AzureAIClient

logger = logging.getLogger(__name__)

# Classifier prompt template
CLASSIFIER_PROMPT = """You are a strict classifier.
Task: Decide if the user question is about the repository {repo_name} (code, architecture, configuration, or operations).

Answer with ONE token only: "IN_SCOPE" or "OUT_OF_SCOPE".

User query: {user_query}"""


async def classify_scope(
    repo_name: str,
    user_query: str,
    provider: str = "google",
    model: str = None
) -> str:
    """
    Classify if a user query is in-scope or out-of-scope for the repository.

    Args:
        repo_name: Name of the repository
        user_query: User's query to classify
        provider: Model provider (google, openai, openrouter, ollama, deepseek, azure)
        model: Optional model name

    Returns:
        "IN_SCOPE" or "OUT_OF_SCOPE"
    """
    try:
        # Format the classifier prompt
        prompt = CLASSIFIER_PROMPT.format(
            repo_name=repo_name,
            user_query=user_query
        )

        logger.info(f"Classifying scope for query: {user_query[:100]}...")

        # Get model configuration
        model_config = get_model_config(provider, model)["model_kwargs"]

        # Create classification request based on provider
        if provider == "ollama":
            client = OllamaClient()
            model_kwargs = {
                "model": model_config["model"],
                "stream": False,
                "options": {
                    "temperature": 0.0,  # Use 0 temperature for deterministic classification
                    "num_ctx": 512  # Small context for simple classification
                }
            }

            api_kwargs = client.convert_inputs_to_api_kwargs(
                input=prompt,
                model_kwargs=model_kwargs,
                model_type=ModelType.LLM
            )

            response = await client.acall(api_kwargs=api_kwargs, model_type=ModelType.LLM)
            result = getattr(response, 'response', None) or str(response)

        elif provider == "openrouter":
            client = OpenRouterClient()
            model_kwargs = {
                "model": model,
                "stream": False,
                "temperature": 0.0
            }

            api_kwargs = client.convert_inputs_to_api_kwargs(
                input=prompt,
                model_kwargs=model_kwargs,
                model_type=ModelType.LLM
            )

            response = await client.acall(api_kwargs=api_kwargs, model_type=ModelType.LLM)
            result = str(response)

        elif provider == "openai":
            client = OpenAIClient()
            model_kwargs = {
                "model": model,
                "stream": False,
                "temperature": 0.0
            }

            api_kwargs = client.convert_inputs_to_api_kwargs(
                input=prompt,
                model_kwargs=model_kwargs,
                model_type=ModelType.LLM
            )

            response = await client.acall(api_kwargs=api_kwargs, model_type=ModelType.LLM)
            # Extract content from OpenAI response
            if hasattr(response, 'choices') and len(response.choices) > 0:
                result = response.choices[0].message.content
            else:
                result = str(response)

        elif provider == "azure":
            client = AzureAIClient()
            model_kwargs = {
                "model": model,
                "stream": False,
                "temperature": 0.0
            }

            api_kwargs = client.convert_inputs_to_api_kwargs(
                input=prompt,
                model_kwargs=model_kwargs,
                model_type=ModelType.LLM
            )

            response = await client.acall(api_kwargs=api_kwargs, model_type=ModelType.LLM)
            # Extract content from Azure response
            if hasattr(response, 'choices') and len(response.choices) > 0:
                result = response.choices[0].message.content
            else:
                result = str(response)

        elif provider == "deepseek":
            client = DeepSeekClient()
            model_kwargs = {
                "model": model,
                "stream": False,
                "temperature": 0.0
            }

            api_kwargs = client.convert_inputs_to_api_kwargs(
                input=prompt,
                model_kwargs=model_kwargs,
                model_type=ModelType.LLM
            )

            response = await client.acall(api_kwargs=api_kwargs, model_type=ModelType.LLM)
            # Extract content from DeepSeek response
            if hasattr(response, 'choices') and len(response.choices) > 0:
                result = response.choices[0].message.content
            else:
                result = str(response)

        else:  # Google (default)
            model_instance = genai.GenerativeModel(
                model_name=model_config["model"],
                generation_config={
                    "temperature": 0.0  # Deterministic classification
                }
            )

            response = model_instance.generate_content(prompt)
            result = response.text

        # Clean up and validate result
        result = result.strip().upper()

        # Check if result contains valid token
        if "IN_SCOPE" in result and "OUT_OF_SCOPE" not in result:
            logger.info("Query classified as IN_SCOPE")
            return "IN_SCOPE"
        elif "OUT_OF_SCOPE" in result:
            logger.info("Query classified as OUT_OF_SCOPE")
            return "OUT_OF_SCOPE"
        else:
            # Fail closed: if unclear, assume out of scope
            logger.warning(f"Unclear classification result: {result}, defaulting to OUT_OF_SCOPE")
            return "OUT_OF_SCOPE"

    except Exception as e:
        logger.error(f"Error in scope classification: {str(e)}")
        # Fail closed: on error, assume out of scope
        return "OUT_OF_SCOPE"


def get_out_of_scope_message(repo_name: str, language_name: str = "English") -> str:
    """
    Get the out-of-scope rejection message.

    Args:
        repo_name: Name of the repository
        language_name: User's language preference

    Returns:
        Rejection message in the appropriate language
    """
    # Base message in English
    base_message = f"This assistant only answers questions about the repository {repo_name}. Your request is outside its scope."

    # Language-specific messages (can be extended)
    messages = {
        "English": base_message,
        "Vietnamese": f"Trợ lý này chỉ trả lời các câu hỏi về repository {repo_name}. Yêu cầu của bạn nằm ngoài phạm vi.",
        "Chinese": f"此助手仅回答有关仓库 {repo_name} 的问题。您的请求超出范围。",
        "Japanese": f"このアシスタントはリポジトリ {repo_name} に関する質問のみに回答します。あなたのリクエストは範囲外です。",
        "Korean": f"이 도우미는 저장소 {repo_name}에 대한 질문만 답변합니다. 요청이 범위를 벗어났습니다。",
        "Spanish": f"Este asistente solo responde preguntas sobre el repositorio {repo_name}. Su solicitud está fuera de alcance.",
        "French": f"Cet assistant ne répond qu'aux questions sur le référentiel {repo_name}. Votre demande est hors de portée.",
        "German": f"Dieser Assistent beantwortet nur Fragen zum Repository {repo_name}. Ihre Anfrage liegt außerhalb des Umfangs.",
    }

    return messages.get(language_name, base_message)
