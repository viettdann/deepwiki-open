"""
Syntax-aware text splitter for code documents.

Respects language syntax boundaries (functions, classes, comments) for C#, TypeScript,
JavaScript, and Python. Falls back to standard TextSplitter for unsupported languages
or when parsing fails.

Features:
    - Thread-safe parser caching
    - Automatic language detection from file extension or shebang
    - Configurable via USE_SYNTAX_AWARE_CHUNKING environment variable
    - Metrics collection for observability
    - Graceful fallback to standard splitting
"""

from __future__ import annotations

import logging
import os
import threading
from copy import deepcopy
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, ClassVar, Dict, List, Optional

from adalflow.components.data_process.text_splitter import TextSplitter
from adalflow.core.tokenizer import Tokenizer
from adalflow.core.types import Document
from adalflow.utils.registry import EntityMapping

if TYPE_CHECKING:
    from tree_sitter import Tree

# Attempt to import tree-sitter; gracefully degrade if unavailable
try:
    from tree_sitter import Parser
    from tree_sitter_languages import get_language, get_parser

    TREE_SITTER_AVAILABLE = True
except ImportError:
    TREE_SITTER_AVAILABLE = False
    Parser = None  # type: ignore[assignment,misc]


log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
MAX_FILE_SIZE_BYTES: int = 500 * 1024  # 500 KB
MAX_NESTING_DEPTH: int = 2
OVERLAP_LINES: int = 4  # Number of context lines to include at block boundaries

def _compute_max_embedding_tokens() -> int:
    """
    Compute the maximum token limit based on the current embedder model configuration.

    Returns:
        int: Maximum embedding tokens (16384 for text-embedding-3-large, 8000 otherwise)
    """
    try:
        # Import here to avoid circular dependency
        from api.data_pipeline import MAX_EMBEDDING_TOKENS
        return MAX_EMBEDDING_TOKENS
    except ImportError:
        # Fallback to default if import fails
        return 8000

# Maximum token limit for embedding models (computed at module load time)
# 16384 for text-embedding-3-large, 8000 for other models
MAX_EMBEDDING_TOKENS: int = _compute_max_embedding_tokens()

# Rough token-to-word ratio when tokenizer fails (conservative estimate)
FALLBACK_TOKEN_RATIO: float = 1.3

# Feature flag (opt-in)
USE_SYNTAX_AWARE_CHUNKING: bool = (
    os.getenv("USE_SYNTAX_AWARE_CHUNKING", "false").lower() == "true"
)

# Thread-local storage for parsers (ensures thread safety)
_thread_local = threading.local()

# Sentinel to mark a language parser that failed to initialize
_PARSER_INIT_FAILED = object()

# ---------------------------------------------------------------------------
# Language Extension Mapping
# ---------------------------------------------------------------------------
# NOTE: Extensions like .d.ts require special handling since os.path.splitext
# returns ('.d', '.ts') for 'foo.d.ts'. We handle multi-part extensions first.
_MULTI_EXT_MAP: Dict[str, str] = {
    ".d.ts": "typescript",
}

_SINGLE_EXT_MAP: Dict[str, str] = {
    ".cs": "c_sharp",
    ".ts": "typescript",
    ".mts": "typescript",
    ".cts": "typescript",
    ".tsx": "tsx",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".py": "python",
    ".pyi": "python",
}


# ---------------------------------------------------------------------------
# Data Classes
# ---------------------------------------------------------------------------
@dataclass(slots=True)
class CodeBlock:
    """Represents a parsed code block with associated metadata."""

    text: str
    start_line: int
    end_line: int
    symbol_name: Optional[str] = None
    signature: Optional[str] = None
    parent_symbol: Optional[str] = None
    block_type: Optional[str] = None  # e.g., "class", "method", "function"


@dataclass
class SplitterMetrics:
    """Aggregated metrics for the splitter."""

    parse_success: int = 0
    parse_fail: int = 0
    fallback: int = 0
    by_language: Dict[str, Dict[str, int]] = field(default_factory=dict)

    def record_success(self, language: str, chunks: int, tokens: int) -> None:
        """Record a successful parse."""
        self.parse_success += 1
        lang_stats = self.by_language.setdefault(
            language, {"success": 0, "fail": 0, "total_tokens": 0, "total_chunks": 0}
        )
        lang_stats["success"] += 1
        lang_stats["total_chunks"] += chunks
        lang_stats["total_tokens"] += tokens

    def record_failure(self, language: str) -> None:
        """Record a parse failure."""
        self.parse_fail += 1
        lang_stats = self.by_language.setdefault(
            language, {"success": 0, "fail": 0, "total_tokens": 0, "total_chunks": 0}
        )
        lang_stats["fail"] += 1

    def record_fallback(self) -> None:
        """Record a fallback to the base splitter."""
        self.fallback += 1

    def as_dict(self) -> Dict:
        """Return metrics as a plain dict (useful for logging/serialization)."""
        return {
            "parse_success": self.parse_success,
            "parse_fail": self.parse_fail,
            "fallback": self.fallback,
            "by_language": self.by_language,
        }


# ---------------------------------------------------------------------------
# Parser Management
# ---------------------------------------------------------------------------
def get_thread_parser(language: str) -> Optional[Parser]:
    """
    Retrieve or create a tree-sitter parser for the specified language.

    Parsers are cached per-thread to ensure thread safety. If parser creation
    fails, the failure is cached to avoid repeated initialization attempts.

    Args:
        language: Language identifier compatible with tree-sitter-languages.

    Returns:
        A configured Parser instance, or None if unavailable.
    """
    if not TREE_SITTER_AVAILABLE:
        return None

    if not hasattr(_thread_local, "parsers"):
        _thread_local.parsers: Dict = {}

    cached = _thread_local.parsers.get(language)
    if cached is _PARSER_INIT_FAILED:
        return None
    if cached is not None:
        return cached

    errors: List[str] = []

    # Primary path: explicit Parser + set_language (tree-sitter ≥0.21)
    try:
        lang_obj = get_language(language)
        parser = Parser()
        parser.set_language(lang_obj)
        _thread_local.parsers[language] = parser
        return parser
    except Exception as exc:  # noqa: BLE001
        errors.append(f"set_language: {exc}")

    # Fallback: helper shortcut for older tree-sitter versions
    try:
        parser = get_parser(language)
        _thread_local.parsers[language] = parser
        return parser
    except Exception as exc:  # noqa: BLE001
        errors.append(f"get_parser: {exc}")

    log.warning("Failed to create parser for %s: %s", language, "; ".join(errors))
    _thread_local.parsers[language] = _PARSER_INIT_FAILED
    return None


# ---------------------------------------------------------------------------
# Language Detection
# ---------------------------------------------------------------------------
def detect_language(file_path: Optional[str], text: str) -> Optional[str]:
    """
    Detect programming language from file extension or shebang.

    Args:
        file_path: Path to the source file.
        text: File contents (used for shebang detection).

    Returns:
        Language identifier compatible with tree-sitter-languages, or None.
    """
    if not file_path:
        return None

    # Check multi-part extensions first (e.g., ".d.ts")
    lower_path = file_path.lower()
    for multi_ext, lang in _MULTI_EXT_MAP.items():
        if lower_path.endswith(multi_ext):
            return lang

    # Standard single extension check
    ext = os.path.splitext(file_path)[1].lower()
    if ext in _SINGLE_EXT_MAP:
        return _SINGLE_EXT_MAP[ext]

    # Shebang detection for extensionless scripts
    if text and text.startswith("#!"):
        first_line = text.split("\n", 1)[0]
        if "node" in first_line:
            return "javascript"
        if "python" in first_line:
            return "python"

    return None


# ---------------------------------------------------------------------------
# Tree-Sitter Helpers
# ---------------------------------------------------------------------------
def get_node_text(node, source_bytes: bytes) -> str:
    """Extract text from a tree-sitter node."""
    return source_bytes[node.start_byte : node.end_byte].decode(
        "utf-8", errors="replace"
    )


def extract_signature(node, source_bytes: bytes, max_length: int = 200) -> str:
    """
    Extract a concise signature from a node.

    Returns the first non-empty line, truncated to max_length.
    """
    text = get_node_text(node, source_bytes)
    for line in text.split("\n"):
        stripped = line.strip()
        if stripped:
            if len(stripped) > max_length:
                return stripped[:max_length] + "…"
            return stripped
    return ""


def get_context_lines(
    source_lines: List[str],
    start_line: int,
    end_line: int,
    overlap: int = OVERLAP_LINES,
) -> tuple[str, str]:
    """
    Extract leading and trailing context lines for a code block.

    Args:
        source_lines: All lines of the source file.
        start_line: 0-indexed start line of the block.
        end_line: 0-indexed end line of the block.
        overlap: Number of context lines to include.

    Returns:
        Tuple of (leading_context, trailing_context) as strings.
    """
    leading_start = max(0, start_line - overlap)
    leading_lines = source_lines[leading_start:start_line]

    trailing_end = min(len(source_lines), end_line + 1 + overlap)
    trailing_lines = source_lines[end_line + 1 : trailing_end]

    return "\n".join(leading_lines), "\n".join(trailing_lines)


# ---------------------------------------------------------------------------
# Language-Specific Extractors
# ---------------------------------------------------------------------------
class CSharpExtractor:
    """Extract C# code blocks respecting syntax boundaries."""

    CHUNK_TYPES: ClassVar[frozenset] = frozenset({
        "namespace_declaration",
        "file_scoped_namespace_declaration",
        "class_declaration",
        "struct_declaration",
        "interface_declaration",
        "enum_declaration",
        "record_declaration",
        "method_declaration",
        "property_declaration",
        "constructor_declaration",
        "destructor_declaration",
        "operator_declaration",
        "indexer_declaration",
    })

    CONTAINER_TYPES: ClassVar[frozenset] = frozenset({
        "namespace_declaration",
        "file_scoped_namespace_declaration",
        "class_declaration",
        "struct_declaration",
        "interface_declaration",
    })

    @classmethod
    def extract_blocks(
        cls, tree: Tree, source_bytes: bytes, file_path: str
    ) -> List[CodeBlock]:
        """
        Extract code blocks from a C# syntax tree.

        Args:
            tree: Parsed tree-sitter tree.
            source_bytes: Original source as bytes.
            file_path: Path to the source file (for logging).

        Returns:
            List of CodeBlock instances.
        """
        blocks: List[CodeBlock] = []
        root_node = tree.root_node

        if root_node.has_error:
            log.debug(
                "C# parse tree has errors for %s; proceeding with best effort",
                file_path,
            )

        # Collect using directives to prepend to the first block
        using_statements: List[str] = []
        for node in root_node.children:
            if node.type == "using_directive":
                using_statements.append(get_node_text(node, source_bytes))

        using_text = "\n".join(using_statements) if using_statements else None

        def _get_identifier(node) -> Optional[str]:
            """Find the identifier child of a node."""
            for child in node.children:
                if child.type == "identifier":
                    return get_node_text(child, source_bytes)
            return None

        def traverse(node, parent_name: Optional[str] = None, depth: int = 0) -> None:
            if depth > MAX_NESTING_DEPTH:
                return

            if node.type in cls.CHUNK_TYPES:
                symbol_name = _get_identifier(node) or f"anonymous_{node.type}"
                text = get_node_text(node, source_bytes)

                # Prepend using statements to the first extracted block
                if using_text and not blocks:
                    text = using_text + "\n\n" + text

                blocks.append(
                    CodeBlock(
                        text=text,
                        start_line=node.start_point[0],
                        end_line=node.end_point[0],
                        symbol_name=symbol_name,
                        signature=extract_signature(node, source_bytes),
                        parent_symbol=parent_name,
                        block_type=node.type,
                    )
                )

                # Recurse into container types for nested definitions
                if node.type in cls.CONTAINER_TYPES:
                    for child in node.children:
                        traverse(child, symbol_name, depth + 1)
            else:
                for child in node.children:
                    traverse(child, parent_name, depth)

        traverse(root_node)
        return blocks


class TypeScriptJavaScriptExtractor:
    """Extract TypeScript/JavaScript code blocks respecting syntax boundaries."""

    CHUNK_TYPES: ClassVar[frozenset] = frozenset({
        "function_declaration",
        "method_definition",
        "arrow_function",
        "class_declaration",
        "interface_declaration",
        "type_alias_declaration",
        "enum_declaration",
        "export_statement",
        "lexical_declaration",  # const/let at module level
    })

    CONTAINER_TYPES: ClassVar[frozenset] = frozenset({
        "class_declaration",
        "interface_declaration",
    })

    @classmethod
    def extract_blocks(
        cls, tree: Tree, source_bytes: bytes, file_path: str
    ) -> List[CodeBlock]:
        """
        Extract code blocks from a TypeScript/JavaScript syntax tree.

        Args:
            tree: Parsed tree-sitter tree.
            source_bytes: Original source as bytes.
            file_path: Path to the source file (for logging).

        Returns:
            List of CodeBlock instances.
        """
        blocks: List[CodeBlock] = []
        root_node = tree.root_node

        if root_node.has_error:
            log.debug(
                "TS/JS parse tree has errors for %s; proceeding with best effort",
                file_path,
            )

        # Collect import statements (import_statement nodes at root level)
        import_statements: List[str] = []
        for node in root_node.children:
            if node.type == "import_statement":
                import_statements.append(get_node_text(node, source_bytes))

        import_text = "\n".join(import_statements) if import_statements else None

        def _get_symbol_name(node) -> Optional[str]:
            """Determine the symbol name for a node."""
            if node.type == "function_declaration":
                for child in node.children:
                    if child.type == "identifier":
                        return get_node_text(child, source_bytes)

            elif node.type in {
                "class_declaration",
                "interface_declaration",
                "type_alias_declaration",
                "enum_declaration",
            }:
                for child in node.children:
                    if child.type in {"identifier", "type_identifier"}:
                        return get_node_text(child, source_bytes)

            elif node.type == "method_definition":
                for child in node.children:
                    if child.type == "property_identifier":
                        return get_node_text(child, source_bytes)

            elif node.type == "arrow_function":
                # Arrow functions are often assigned to variables
                parent = node.parent
                if parent and parent.type == "variable_declarator":
                    for sibling in parent.children:
                        if sibling.type == "identifier":
                            return get_node_text(sibling, source_bytes)

            elif node.type == "lexical_declaration":
                # const foo = ... or let bar = ...
                for child in node.children:
                    if child.type == "variable_declarator":
                        for grandchild in child.children:
                            if grandchild.type == "identifier":
                                return get_node_text(grandchild, source_bytes)

            elif node.type == "export_statement":
                # Try to find the exported name
                for child in node.children:
                    is_nested_chunk = (
                        child.type in cls.CHUNK_TYPES
                        and child.type != "export_statement"
                    )
                    if is_nested_chunk:
                        return _get_symbol_name(child)
                return "export"

            return None

        def traverse(node, parent_name: Optional[str] = None, depth: int = 0) -> None:
            if depth > MAX_NESTING_DEPTH:
                return

            if node.type in cls.CHUNK_TYPES:
                symbol_name = _get_symbol_name(node) or f"anonymous_{node.type}"
                text = get_node_text(node, source_bytes)

                # Prepend imports to the first extracted block
                if import_text and not blocks:
                    text = import_text + "\n\n" + text

                blocks.append(
                    CodeBlock(
                        text=text,
                        start_line=node.start_point[0],
                        end_line=node.end_point[0],
                        symbol_name=symbol_name,
                        signature=extract_signature(node, source_bytes),
                        parent_symbol=parent_name,
                        block_type=node.type,
                    )
                )

                # Recurse into containers
                if node.type in cls.CONTAINER_TYPES:
                    for child in node.children:
                        traverse(child, symbol_name, depth + 1)
            else:
                for child in node.children:
                    traverse(child, parent_name, depth)

        traverse(root_node)
        return blocks


class PythonExtractor:
    """Extract Python code blocks respecting syntax boundaries."""

    CHUNK_TYPES: ClassVar[frozenset] = frozenset({
        "function_definition",
        "async_function_definition",
        "class_definition",
    })

    @classmethod
    def extract_blocks(
        cls, tree: Tree, source_bytes: bytes, file_path: str
    ) -> List[CodeBlock]:
        """
        Extract code blocks from a Python syntax tree.

        Args:
            tree: Parsed tree-sitter tree.
            source_bytes: Original source as bytes.
            file_path: Path to the source file (for logging).

        Returns:
            List of CodeBlock instances.
        """
        blocks: List[CodeBlock] = []
        root_node = tree.root_node

        if root_node.has_error:
            log.debug(
                "Python parse tree has errors for %s; proceeding with best effort",
                file_path,
            )

        # Collect top-level import statements
        import_types = {"import_statement", "import_from_statement"}
        import_nodes = [
            n for n in root_node.children if n.type in import_types
        ]
        import_text = (
            "\n".join(get_node_text(n, source_bytes) for n in import_nodes)
            if import_nodes
            else None
        )

        def _get_identifier(node) -> Optional[str]:
            for child in node.children:
                if child.type == "identifier":
                    return get_node_text(child, source_bytes)
            return None

        def traverse(node, parent_name: Optional[str] = None, depth: int = 0) -> None:
            if depth > MAX_NESTING_DEPTH:
                return

            extract_this = False
            symbol_name: Optional[str] = None

            if node.type in {"function_definition", "async_function_definition"}:
                symbol_name = _get_identifier(node) or "anonymous_function"
                extract_this = True
            elif node.type == "class_definition":
                symbol_name = _get_identifier(node) or "anonymous_class"
                extract_this = True

            if extract_this:
                text = get_node_text(node, source_bytes)

                # Prepend imports to the first extracted block
                if import_text and not blocks:
                    text = import_text + "\n\n" + text

                blocks.append(
                    CodeBlock(
                        text=text,
                        start_line=node.start_point[0],
                        end_line=node.end_point[0],
                        symbol_name=symbol_name,
                        signature=extract_signature(node, source_bytes),
                        parent_symbol=parent_name,
                        block_type=node.type,
                    )
                )

                # Recurse into class bodies for methods
                if node.type == "class_definition":
                    for child in node.children:
                        traverse(child, symbol_name, depth + 1)
            else:
                for child in node.children:
                    traverse(child, parent_name, depth)

        traverse(root_node)
        return blocks


# ---------------------------------------------------------------------------
# Extractor Registry
# ---------------------------------------------------------------------------
_EXTRACTORS: Dict[str, type] = {
    "c_sharp": CSharpExtractor,
    "typescript": TypeScriptJavaScriptExtractor,
    "tsx": TypeScriptJavaScriptExtractor,
    "javascript": TypeScriptJavaScriptExtractor,
    "python": PythonExtractor,
}


# ---------------------------------------------------------------------------
# Main Splitter Class
# ---------------------------------------------------------------------------
class CodeAwareTextSplitter(TextSplitter):
    """
    Syntax-aware text splitter that respects code boundaries.

    Supports C#, TypeScript, JavaScript, and Python. Falls back to base
    TextSplitter for unsupported languages or when parsing fails.

    Attributes:
        metrics: Collected statistics about parsing and fallback behavior.

    Example:
        >>> splitter = CodeAwareTextSplitter(split_by="token", chunk_size=1024)
        >>> meta = {"file_path": "main.py"}
        >>> docs = splitter.call([Document(text=source_code, meta_data=meta)])
    """

    def __init__(self, *args, **kwargs) -> None:
        """Initialize with the same parameters as TextSplitter."""
        super().__init__(*args, **kwargs)
        self._tokenizer = Tokenizer()
        self._metrics = SplitterMetrics()

        log.info(
            "CodeAwareTextSplitter initialized "
            "(USE_SYNTAX_AWARE_CHUNKING=%s, tree-sitter=%s)",
            USE_SYNTAX_AWARE_CHUNKING,
            TREE_SITTER_AVAILABLE,
        )

    @property
    def metrics(self) -> Dict:
        """Return current metrics as a dictionary."""
        return self._metrics.as_dict()

    def count_tokens(self, text: str) -> int:
        """
        Count tokens in text.

        Falls back to a rough word-based estimation if tokenizer fails.
        """
        if not text:
            return 0
        try:
            return self._tokenizer.count_tokens(text)
        except Exception:  # noqa: BLE001
            # Conservative fallback: words × ratio
            return int(len(text.split()) * FALLBACK_TOKEN_RATIO)

    def should_use_syntax_aware(self, doc: Document) -> bool:
        """
        Determine if syntax-aware chunking should be used for this document.

        Checks:
            1. Feature flag is enabled
            2. tree-sitter is available
            3. File size is within limits
            4. Language is detected and supported
        """
        if not USE_SYNTAX_AWARE_CHUNKING:
            return False

        if not TREE_SITTER_AVAILABLE:
            log.debug("tree-sitter not available; cannot use syntax-aware chunking")
            return False

        # File size guard
        if doc.text:
            byte_size = len(doc.text.encode("utf-8"))
            if byte_size > MAX_FILE_SIZE_BYTES:
                log.info(
                    "File too large (%d bytes > %d); using standard splitter",
                    byte_size,
                    MAX_FILE_SIZE_BYTES,
                )
                return False

        # Language detection
        file_path = doc.meta_data.get("file_path") if doc.meta_data else None
        if not file_path:
            return False

        language = detect_language(file_path, doc.text or "")
        if not language:
            return False

        if language not in _EXTRACTORS:
            log.debug("No extractor for language '%s'", language)
            return False

        return True

    def _split_code_document(self, doc: Document) -> Optional[List[Document]]:
        """
        Split a code document using syntax-aware parsing.

        Args:
            doc: Document to split.

        Returns:
            List of split documents, or None if parsing fails.
        """
        file_path = doc.meta_data.get("file_path") if doc.meta_data else ""
        language = detect_language(file_path, doc.text or "")

        if not language:
            log.debug("Language not detected for %s", file_path)
            return None

        parser = get_thread_parser(language)
        if not parser:
            log.warning("Parser unavailable for '%s'", language)
            self._metrics.record_failure(language)
            return None

        try:
            source_bytes = (doc.text or "").encode("utf-8")
            tree = parser.parse(source_bytes)

            # Select the appropriate extractor
            extractor_cls = _EXTRACTORS.get(language)
            if not extractor_cls:
                log.debug("No extractor for language '%s'", language)
                return None

            blocks = extractor_cls.extract_blocks(tree, source_bytes, file_path)

            if not blocks:
                log.debug("No blocks extracted from %s", file_path)
                return None

            # Convert blocks to documents
            split_docs: List[Document] = []
            total_tokens = 0

            for idx, block in enumerate(blocks):
                token_count = self.count_tokens(block.text)

                # Handle oversized blocks by falling back to base splitter
                if token_count > MAX_EMBEDDING_TOKENS:
                    log.warning(
                        "Block '%s' too large (%d tokens > %d); sub-splitting",
                        block.symbol_name,
                        token_count,
                        MAX_EMBEDDING_TOKENS,
                    )
                    temp_doc = Document(
                        text=block.text,
                        meta_data=doc.meta_data,
                        id=f"{doc.id}_block_{idx}",
                    )
                    sub_docs = super().call([temp_doc])

                    for sub_idx, sub_doc in enumerate(sub_docs):
                        meta = deepcopy(doc.meta_data) if doc.meta_data else {}
                        sub_token_count = self.count_tokens(sub_doc.text or "")
                        meta.update({
                            "symbol_name": f"{block.symbol_name}_part_{sub_idx}",
                            "signature": block.signature,
                            "parent_symbol": block.parent_symbol,
                            "language": language,
                            "token_count": sub_token_count,
                            "block_type": block.block_type,
                            "oversized": True,
                        })
                        sub_doc.meta_data = meta
                        sub_doc.parent_doc_id = doc.id
                        sub_doc.order = len(split_docs)
                        split_docs.append(sub_doc)
                        total_tokens += sub_token_count
                else:
                    meta = deepcopy(doc.meta_data) if doc.meta_data else {}
                    meta.update({
                        "symbol_name": block.symbol_name,
                        "signature": block.signature,
                        "parent_symbol": block.parent_symbol,
                        "language": language,
                        "token_count": token_count,
                        "block_type": block.block_type,
                        "start_line": block.start_line,
                        "end_line": block.end_line,
                    })

                    split_docs.append(
                        Document(
                            text=block.text,
                            meta_data=meta,
                            parent_doc_id=doc.id,
                            order=idx,
                        )
                    )
                    total_tokens += token_count

            self._metrics.record_success(language, len(split_docs), total_tokens)
            log.info(
                "Syntax-aware split: %s → %d chunks (%s, %d tokens)",
                file_path,
                len(split_docs),
                language,
                total_tokens,
            )
            return split_docs

        except Exception as exc:  # noqa: BLE001
            log.error("Failed to parse %s: %s", file_path, exc, exc_info=True)
            self._metrics.record_failure(language)
            return None

    def call(self, documents: List[Document]) -> List[Document]:
        """
        Process documents with syntax-aware splitting where applicable.

        Falls back to base TextSplitter for unsupported languages or when
        parsing fails.

        Args:
            documents: List of Document instances to process.

        Returns:
            List of split Document instances.

        Raises:
            TypeError: If input is not a list of Documents.
            ValueError: If any document has None text.
        """
        if not isinstance(documents, list):
            raise TypeError("Input must be a list of Documents")

        for doc in documents:
            if not isinstance(doc, Document):
                raise TypeError(f"Expected Document, got {type(doc).__name__}")
            if doc.text is None:
                raise ValueError(f"Document text cannot be None (doc.id={doc.id})")

        split_docs: List[Document] = []

        for doc in documents:
            file_path = doc.meta_data.get("file_path") if doc.meta_data else None
            language = detect_language(file_path, doc.text or "")
            used_syntax_aware = False

            # Attempt syntax-aware splitting
            if self.should_use_syntax_aware(doc):
                log.debug(
                    "Attempting syntax-aware chunking for '%s' (language=%s)",
                    file_path or doc.id,
                    language,
                )
                result = self._split_code_document(doc)
                if result is not None:
                    split_docs.extend(result)
                    used_syntax_aware = True

            # Fallback to base splitter
            if not used_syntax_aware:
                log.debug("Using base splitter for '%s'", file_path or doc.id)
                self._metrics.record_fallback()
                fallback_docs = super().call([doc])

                # Enrich fallback docs with available metadata
                # Only enrich when feature flag is enabled (fallback after parse failure)
                if language and USE_SYNTAX_AWARE_CHUNKING:
                    base_name = (
                        os.path.splitext(os.path.basename(file_path))[0]
                        if file_path
                        else None
                    )
                    for fb_doc in fallback_docs:
                        meta = deepcopy(fb_doc.meta_data) if fb_doc.meta_data else {}
                        meta.setdefault("language", language)
                        if base_name and not meta.get("symbol_name"):
                            meta["symbol_name"] = base_name
                        if "signature" not in meta:
                            # Use first non-empty line as a simple signature
                            first_line = next(
                                (
                                    line.strip()
                                    for line in (fb_doc.text or "").splitlines()
                                    if line.strip()
                                ),
                                "",
                            )
                            if first_line:
                                meta["signature"] = first_line[:200]
                            else:
                                meta["signature"] = base_name or "chunk"
                        if "token_count" not in meta:
                            meta["token_count"] = self.count_tokens(fb_doc.text or "")
                        meta.setdefault("block_type", "file")
                        fb_doc.meta_data = meta

                split_docs.extend(fallback_docs)

        log.info(
            "Processed %d documents → %d chunks | Metrics: %s",
            len(documents),
            len(split_docs),
            self._metrics.as_dict(),
        )

        return split_docs


# ---------------------------------------------------------------------------
# Convenience Factory
# ---------------------------------------------------------------------------
def create_code_splitter(
    chunk_size: int = 1024,
    chunk_overlap: int = 200,
    split_by: str = "token",
    **kwargs,
) -> CodeAwareTextSplitter:
    """
    Create a CodeAwareTextSplitter with sensible defaults.

    Args:
        chunk_size: Maximum chunk size (tokens or characters).
        chunk_overlap: Overlap between chunks.
        split_by: Split strategy ("token" or "word").
        **kwargs: Additional arguments passed to TextSplitter.

    Returns:
        Configured CodeAwareTextSplitter instance.
    """
    return CodeAwareTextSplitter(
        split_by=split_by,
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        **kwargs,
    )


# Register custom splitter with AdalFlow's registry so serialized pipelines
# can be deserialized (e.g., when loading cached LocalDB states) even before
# a CodeAwareTextSplitter instance is created.
EntityMapping.register("CodeAwareTextSplitter", CodeAwareTextSplitter)
